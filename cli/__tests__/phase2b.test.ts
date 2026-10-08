// Phase 2 of docs/plans/implementation-plan.md, second slice: MCP
// registration (2.4), plan (2.5), app services (2.6), the generated support
// matrix (2.7) and the wizard (2.8).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { registerMcp, type Exec } from "../setup.js";
import { mapComponents, planPush, diffWithFigma, type StorybookReader, type FigmaReader } from "../services.js";
import { renderSupportMatrix, updateSupportMatrix, SUPPORT_MATRIX_START, SUPPORT_MATRIX_END } from "../frameworks.js";
import { figmaFileKey } from "../wizard.js";
import type { StorybookComponent } from "../mapper.js";

const CLI = fileURLToPath(new URL("../index.js", import.meta.url));
const README = fileURLToPath(new URL("../../../README.md", import.meta.url));

function withProject(files: Record<string, string>, fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "storysync-phase2b-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  mkdirSync(join(dir, ".git"), { recursive: true });
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

// --- 2.4 MCP registration ---

/** A stand-in `claude` that records its calls. */
function fakeClaude(state: { servers: Record<string, string>; figma?: boolean }): { exec: Exec; calls: string[] } {
  const calls: string[] = [];
  const exec: Exec = (command, args) => {
    calls.push([command, ...args].join(" "));
    const [, sub, ...rest] = args;
    const configured = `Configured servers: ${[...Object.keys(state.servers), ...(state.figma ? ["plugin:figma:figma"] : [])].join(", ")}`;
    if (sub === "get") {
      const url = state.servers[rest[0]];
      return url ? { status: 0, stdout: `storybook:\n  Type: http\n  URL: ${url}\n` } : { status: 1, stdout: `No MCP server found with name: "${rest[0]}". ${configured}` };
    }
    if (sub === "remove") { delete state.servers[rest[0]]; return { status: 0, stdout: "" }; }
    if (sub === "add") { state.servers[rest[rest.length - 2]] = rest[rest.length - 1]; return { status: 0, stdout: "" }; }
    if (sub === "list") return { status: 0, stdout: configured };
    return { status: 1, stdout: "" };
  };
  return { exec, calls };
}

test("registerMcp claude: adds Storybook MCP, and says when Figma is there", () => {
  const state = { servers: {} as Record<string, string>, figma: true };
  const { exec, calls } = fakeClaude(state);
  const r = registerMcp("claude", ".", "http://localhost:6007", exec);
  assert.equal(r.ok, true);
  assert.equal(state.servers.storybook, "http://localhost:6007/mcp");
  assert.ok(calls.includes("claude mcp add --transport http storybook http://localhost:6007/mcp"), calls.join("\n"));
  assert.ok(r.done.some((d) => /Figma is available/.test(d)));
  // The "not found" answer already lists the servers: no slow health check.
  assert.ok(!calls.some((c) => c.endsWith("mcp list")));
});

test("registerMcp claude: leaves a matching entry alone", () => {
  const same = fakeClaude({ servers: { storybook: "http://localhost:6006/mcp" } });
  assert.match(registerMcp("claude", ".", "http://localhost:6006", same.exec).done[0], /already registered/);
  assert.ok(!same.calls.some((c) => / add /.test(c)));
});

test("registerMcp claude: one that points elsewhere is kept and reported, and replaced only when asked", () => {
  // Claude Code shares local servers across a repository's worktrees, so this
  // may be the user's own registration for their main checkout.
  const state = { servers: { storybook: "http://localhost:6007/mcp" } };
  const other = fakeClaude(state);
  const kept = registerMcp("claude", ".", "http://localhost:6006", other.exec);
  assert.deepEqual(kept.conflict, { current: "http://localhost:6007/mcp", wanted: "http://localhost:6006/mcp" });
  assert.equal(state.servers.storybook, "http://localhost:6007/mcp");
  assert.ok(!other.calls.some((c) => / remove /.test(c)));
  assert.match(kept.notes[0], /pointing at http:\/\/localhost:6007\/mcp, so it was kept[\s\S]*--replace-mcp/);

  const replaced = registerMcp("claude", ".", "http://localhost:6006", other.exec, true);
  assert.ok(other.calls.includes("claude mcp remove storybook"));
  assert.equal(state.servers.storybook, "http://localhost:6006/mcp");
  assert.match(replaced.done[0], /Removed Claude Code's storybook server \(http:\/\/localhost:6007\/mcp\), as asked/);
});

test("registerMcp claude: not installed is a clear note, not a crash", () => {
  const r = registerMcp("claude", ".", "http://localhost:6006", () => ({ status: 1, stdout: "'claude' is not recognized as an internal or external command" }));
  assert.equal(r.ok, false);
  assert.match(r.notes[0], /isn't installed/);
});

test("registerMcp cursor: merges into .cursor/mcp.json, keeping other servers", async () => {
  await withProject({ ".cursor/mcp.json": JSON.stringify({ mcpServers: { other: { url: "http://x/mcp" } } }) }, (dir) => {
    const r = registerMcp("cursor", dir, "http://localhost:6006");
    assert.equal(r.ok, true);
    const json = JSON.parse(readFileSync(join(dir, ".cursor", "mcp.json"), "utf8"));
    assert.deepEqual(json.mcpServers, { other: { url: "http://x/mcp" }, storybook: { url: "http://localhost:6006/mcp" } });
    assert.match(registerMcp("cursor", dir, "http://localhost:6006").done[0], /already in/);
  });
});

test("registerMcp codex: adds a block to .codex/config.toml; a different one is kept unless replace", async () => {
  await withProject({ ".codex/config.toml": "model = \"o4\"\n" }, (dir) => {
    registerMcp("codex", dir, "http://localhost:6006");
    let toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");
    assert.match(toml, /model = "o4"\n\n\[mcp_servers\.storybook\]\nurl = "http:\/\/localhost:6006\/mcp"\n/);
    assert.equal(registerMcp("codex", dir, "http://localhost:6007").conflict?.current, "http://localhost:6006/mcp");
    assert.match(readFileSync(join(dir, ".codex", "config.toml"), "utf8"), /localhost:6006/);
    registerMcp("codex", dir, "http://localhost:6007", undefined, true);
    toml = readFileSync(join(dir, ".codex", "config.toml"), "utf8");
    assert.equal((toml.match(/\[mcp_servers\.storybook\]/g) ?? []).length, 1);
    assert.match(toml, /localhost:6007/);
  });
});

// --- 2.6 services, 2.5 plan ---

function component(name: string, props: StorybookComponent["props"]): StorybookComponent {
  return { name, props, stories: [] };
}

const fakeStorybook: StorybookReader = {
  listComponents: async () => [
    { id: "forms-button", name: "Button", title: "Forms/Button", category: "Forms" },
    { id: "info-badge", name: "Badge", title: "Info/Badge", category: "Info" },
  ] as Awaited<ReturnType<StorybookReader["listComponents"]>>,
  getComponent: async (id: string) => id === "forms-button"
    ? component("Button", [{ name: "size", type: { name: "union", raw: `"sm" | "lg"` } }, { name: "severity", type: { name: "ButtonSeverity" } }])
    : component("Badge", [{ name: "label", type: { name: "string" } }]),
};

test("mapComponents: maps, reports progress, and keeps --components' typo check", async () => {
  const seen: string[] = [];
  const r = await mapComponents(fakeStorybook, { maxCombinations: 256, onListed: (n) => seen.push(`listed ${n}`), onComponent: (c) => seen.push(c.name) });
  assert.deepEqual(seen, ["listed 2", "Button", "Badge"]);
  assert.deepEqual(r.summary, { total: 2, mapped: 2, failed: 0, capped: 0, totalCombinations: 3 });
  await assert.rejects(mapComponents(fakeStorybook, { maxCombinations: 256, components: ["Buton"] }), /matched no component named "Buton"/);
});

test("planPush: what Figma would get, and what to look at first", async () => {
  await withProject({ "src/tokens.css": ":root { --color-brand: #395aec; --gutter: 4px; }\n" }, async (dir) => {
    const plan = await planPush({ project: dir, storybook: fakeStorybook, maxCombinations: 256 });
    assert.deepEqual(plan.figma, { variableCollections: 1, variables: 1, componentSets: 2, variants: 3 });
    assert.equal(plan.tokens?.uncategorized, 1);
    assert.ok(plan.attention.some((a) => /Forms\/Button: severity won't be variants/.test(a)), plan.attention.join("\n"));
  });
});

test("planPush: without Storybook, still plans tokens and says why components are missing", async () => {
  await withProject({ "src/tokens.css": ":root { --color-brand: #395aec; }\n" }, async (dir) => {
    const plan = await planPush({ project: dir, storybook: null, storybookError: "Storybook MCP at http://localhost:6006 isn't reachable", maxCombinations: 256 });
    assert.equal(plan.components, null);
    assert.equal(plan.figma.variables, 1);
    assert.ok(plan.attention.some((a) => /Components can't be planned: Storybook MCP/.test(a)));
  });
});

test("diffWithFigma: a failed Figma read is recorded, reported in order, and the rest still runs", async () => {
  const events: string[] = [];
  const figma: FigmaReader = {
    getVariables: async () => { throw new Error("rate limited"); },
    getComponents: async () => [{ name: "Button", variantProperties: [{ name: "size", type: "VARIANT", values: ["sm", "lg"] }], variantCount: 2 }],
  };
  await withProject({}, async (dir) => {
    const r = await diffWithFigma(figma, fakeStorybook, { fileKey: "abc123XYZabc", project: dir }, {
      onStart: (s) => events.push(`start ${s}`),
      onDone: (s) => events.push(`done ${s}`),
      onFail: (s) => events.push(`fail ${s}`),
    });
    assert.equal(r.figmaReadFailed, true);
    assert.deepEqual(r.tokenDiffs, []);
    assert.deepEqual(events, ["start figma-variables", "fail figma-variables", "start figma-components", "done figma-components", "start storybook-components", "done storybook-components"]);
  });
});

// --- 2.7 support matrix ---

test("README's support matrix is generated from the profiles (run pnpm docs:support after changing them)", () => {
  const readme = readFileSync(README, "utf8");
  const a = readme.indexOf(SUPPORT_MATRIX_START);
  const b = readme.indexOf(SUPPORT_MATRIX_END) + SUPPORT_MATRIX_END.length;
  assert.ok(a >= 0 && b > a, "README has the support-matrix markers");
  // Line endings as checked out (CRLF on Windows) aside.
  assert.equal(readme.slice(a, b).replace(/\r\n/g, "\n"), renderSupportMatrix());
  assert.equal(updateSupportMatrix(`x\n${SUPPORT_MATRIX_START}\nold\n${SUPPORT_MATRIX_END}\ny`), `x\n${renderSupportMatrix()}\ny`);
});

// --- 2.8 wizard ---

test("figmaFileKey: from a design URL, a file URL or a bare key", () => {
  assert.equal(figmaFileKey("https://www.figma.com/design/nge2jqPcZmYdtR6jbGmOis/Untitled?node-id=0-1"), "nge2jqPcZmYdtR6jbGmOis");
  assert.equal(figmaFileKey("https://figma.com/file/abc123XYZabc/x"), "abc123XYZabc");
  assert.equal(figmaFileKey("nge2jqPcZmYdtR6jbGmOis"), "nge2jqPcZmYdtR6jbGmOis");
  assert.equal(figmaFileKey("not a key!"), null);
});

const READY_PROJECT = {
  ".storybook/main.ts": `export default { addons: ["@storybook/addon-mcp"], framework: "@storybook/react-vite" };`,
  "package.json": JSON.stringify({ devDependencies: { storybook: "^10.6.0", "@storybook/addon-mcp": "^10.6.0" } }),
  "node_modules/storybook/package.json": JSON.stringify({ version: "10.6.0" }),
  "node_modules/@storybook/addon-mcp/package.json": JSON.stringify({ version: "10.6.0" }),
  "src/tokens.css": ":root { --color-brand: #395aec; }\n",
};

test("wizard: answers in, config written, then a doctor check that says to start Storybook", async () => {
  await withProject(READY_PROJECT, (dir) => {
    // URL (default), tokens yes, Figma URL, save yes, client none.
    const answers = ["http://localhost:6199", "y", "https://www.figma.com/design/nge2jqPcZmYdtR6jbGmOis/Untitled", "y", "none", ""].join("\n");
    const r = spawnSync(process.execPath, [CLI, "start", "--project", dir], { input: answers, encoding: "utf8", timeout: 120_000, env: { ...process.env, STORYSYNC_STORYBOOK_URL: "" } });
    const out = `${r.stdout}${r.stderr}`.replace(/\u001b\[[0-9;]*m/g, "");
    assert.equal(r.status, 0, out);
    assert.match(out, /Step 1 of 4: Storybook[\s\S]*Everything looks good/);
    assert.match(out, /Step 2 of 4[\s\S]*Wrote storysync\.config\.json/);
    assert.match(out, /Step 4 of 4: Check[\s\S]*storysync doctor/);
    assert.match(out, /Last step: start Storybook/);
    const config = JSON.parse(readFileSync(join(dir, "storysync.config.json"), "utf8"));
    assert.deepEqual(config, {
      $schema: "./node_modules/storysync/schema.json",
      storybook: { url: "http://localhost:6199" },
      tokens: { source: "css" },
      figma: { fileKey: "nge2jqPcZmYdtR6jbGmOis" },
    });
  });
});

test("wizard: an existing config is kept, not overwritten", async () => {
  await withProject({ ...READY_PROJECT, "storysync.config.json": JSON.stringify({ storybook: { url: "http://localhost:6198" } }) }, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "start", "--project", dir], { input: "none\n", encoding: "utf8", timeout: 120_000 });
    const out = `${r.stdout}${r.stderr}`.replace(/\u001b\[[0-9;]*m/g, "");
    assert.match(out, /Keeping storysync\.config\.json/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "storysync.config.json"), "utf8")), { storybook: { url: "http://localhost:6198" } });
    assert.ok(!existsSync(join(dir, ".claude")), "no client set up when the answer is none");
  });
});
