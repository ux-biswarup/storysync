// Phase 2 of docs/plans/implementation-plan.md, first slice: framework
// profiles (2.3), storysync.config.json (2.1) and doctor (2.2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { frameworkProfile, missingFeatures, FRAMEWORK_PROFILES } from "../frameworks.js";
import { validateConfig, loadConfig, resolveSetting, findConfigFile, CONFIG_FILE } from "../config.js";
import { runDoctor, type DoctorDeps } from "../doctor.js";

const CLI = fileURLToPath(new URL("../index.js", import.meta.url));

function withProject(files: Record<string, string>, fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "storysync-phase2-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  // A .git marker stops config and lockfile lookups from walking above the fixture.
  mkdirSync(join(dir, ".git"), { recursive: true });
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

// --- 2.3 framework profiles ---

test("frameworkProfile: found by package or id; unknown is null", () => {
  assert.equal(frameworkProfile("@storybook/vue3-vite")?.id, "vue3-vite");
  assert.equal(frameworkProfile("react-vite")?.package, "@storybook/react-vite");
  assert.equal(frameworkProfile("@storybook/html-vite"), null);
  assert.equal(frameworkProfile(null), null);
});

test("frameworkProfile: Vue needs experimentalDocgenServer, and says why", () => {
  const vue = frameworkProfile("vue3-vite")!;
  assert.deepEqual(missingFeatures(vue, new Set()), ["experimentalDocgenServer"]);
  assert.deepEqual(missingFeatures(vue, new Set(["experimentalDocgenServer"])), []);
  assert.match(vue.featureReasons.experimentalDocgenServer, /manifest/);
  assert.ok(vue.knownIssues.some((i) => i.id === "named-union-types"));
});

test("frameworkProfile: every profile names a reason for each required feature", () => {
  for (const p of FRAMEWORK_PROFILES) for (const f of p.requiredFeatures) assert.ok(p.featureReasons[f], `${p.id}.${f}`);
});

// --- 2.1 config ---

test("validateConfig: a full, valid config has no problems", () => {
  assert.deepEqual(validateConfig({
    $schema: "./node_modules/storysync/schema.json",
    storybook: { url: "http://localhost:6007" },
    framework: "vue3-vite",
    tokens: { source: "css" },
    components: { include: ["Button", "Tag"], maxCombinations: 64 },
    figma: { fileKey: "nge2jqPcZmYdtR6jbGmOis" },
  }), []);
});

test("validateConfig: names unknown keys and wrong values", () => {
  const problems = validateConfig({ storybok: {}, storybook: { url: "localhost:6006", port: 1 }, tokens: { source: "scss" }, components: { maxCombinations: 0 } });
  assert.ok(problems.some((p) => /unknown key "storybok"/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /unknown key "storybook\.port"/.test(p)));
  assert.ok(problems.some((p) => /storybook\.url" must be an http\(s\) URL/.test(p)));
  assert.ok(problems.some((p) => /tokens\.source" must be one of/.test(p)));
  assert.ok(problems.some((p) => /maxCombinations" must be a positive whole number/.test(p)));
});

test("loadConfig: found above the working folder; a broken file is an error naming it", async () => {
  await withProject({ [CONFIG_FILE]: JSON.stringify({ storybook: { url: "http://localhost:6007" } }), "packages/ui/package.json": "{}" }, (dir) => {
    const loaded = loadConfig(join(dir, "packages", "ui"));
    assert.equal(loaded.path, join(dir, CONFIG_FILE));
    assert.equal(loaded.config.storybook?.url, "http://localhost:6007");
  });
  await withProject({ [CONFIG_FILE]: "{ not json" }, (dir) => {
    assert.throws(() => loadConfig(dir), new RegExp(`${CONFIG_FILE} is not valid JSON`));
  });
  await withProject({}, (dir) => {
    assert.equal(findConfigFile(dir), null);
    assert.deepEqual(loadConfig(dir), { path: null, config: {} });
  });
});

test("resolveSetting: flag, then env, then config, then default", () => {
  assert.deepEqual(resolveSetting({ flag: "f", env: "e", config: "c", fallback: "d" }), { value: "f", from: "flag" });
  assert.deepEqual(resolveSetting({ env: "e", config: "c", fallback: "d" }), { value: "e", from: "env" });
  assert.deepEqual(resolveSetting({ config: "c", fallback: "d" }), { value: "c", from: "config" });
  assert.deepEqual(resolveSetting({ fallback: "d" }), { value: "d", from: "default" });
});

function tokensCli(dir: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, "tokens", ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, STORYSYNC_STORYBOOK_URL: "" } });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.replace(/\u001b\[[0-9;]*m/g, "") };
}

test("tokens CLI: tokens.source from the config is used and said to come from it; a flag overrides it", async () => {
  await withProject({
    [CONFIG_FILE]: JSON.stringify({ tokens: { source: "css" } }),
    "src/tokens.css": ":root { --color-brand: #395aec; }\n",
    "src/app.css": "@theme { --color-accent: #fd6b00; }\n",
  }, (dir) => {
    const fromConfig = tokensCli(dir);
    assert.equal(fromConfig.status, 0, fromConfig.out);
    assert.match(fromConfig.out, /Source: css \(from storysync\.config\.json\)/);
    assert.match(fromConfig.out, /brand/);
    const fromFlag = tokensCli(dir, "--source", "tailwind");
    assert.match(fromFlag.out, /Source: tailwind \(from --source\)/);
    assert.match(fromFlag.out, /accent/);
  });
});

test("CLI: a broken config ends the run, naming the problem", async () => {
  await withProject({ [CONFIG_FILE]: JSON.stringify({ tokens: { source: "scss" } }) }, (dir) => {
    const r = tokensCli(dir);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /tokens\.source" must be one of/);
  });
});

test("diff CLI: without a file key from flag, env or config, says where to give one", async () => {
  await withProject({}, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "diff", "--figma", "http://127.0.0.1:9/mcp"], { cwd: dir, encoding: "utf8", env: { ...process.env, STORYSYNC_FIGMA_FILE_KEY: "" } });
    assert.equal(r.status, 1);
    assert.match(`${r.stdout}${r.stderr}`, /needs a Figma file key: pass --file-key, set STORYSYNC_FIGMA_FILE_KEY, or add figma\.fileKey/);
  });
});

// --- 2.2 doctor ---

const VUE_PROJECT = {
  ".storybook/main.ts": `export default { addons: ["@storybook/addon-mcp"], features: { experimentalDocgenServer: true }, framework: "@storybook/vue3-vite" };`,
  "package.json": JSON.stringify({ devDependencies: { storybook: "^10.6.0", "@storybook/addon-mcp": "^10.6.0" } }),
  "node_modules/storybook/package.json": JSON.stringify({ version: "10.6.0" }),
  "node_modules/@storybook/addon-mcp/package.json": JSON.stringify({ version: "10.6.0" }),
  "src/tokens.css": ":root { --color-brand: #395aec; }\n",
};

function deps(over: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    fetch: (async () => new Response(JSON.stringify({ entries: { a: {}, b: {} } }))) as typeof fetch,
    inspectMcp: async () => ({ tools: ["docs-list", "docs-show"], components: 2 }),
    launchBrowser: async () => "installed chrome",
    claudeVersion: async () => "2.1.177 (Claude Code)",
    nodeVersion: "v22.0.0",
    env: {},
    ...over,
  };
}

const byId = (r: Awaited<ReturnType<typeof runDoctor>>, id: string) => r.checks.find((c) => c.id === id);

test("doctor: a set-up Vue project is ready, with Vue's known limit as information", async () => {
  await withProject(VUE_PROJECT, async (dir) => {
    const r = await runDoctor({ project: dir }, deps());
    assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => c.status === "fail")));
    assert.equal(byId(r, "framework")?.detail, "Vue 3 (Vite), supported");
    assert.equal(byId(r, "mcp")?.detail, "present, 2 components");
    assert.equal(byId(r, "known-named-union-types")?.status, "info");
    assert.deepEqual(r.storybookUrl, { value: "http://localhost:6006", from: "default" });
  });
});

test("doctor: a missing Vue flag and a stopped Storybook fail, each with a fix", async () => {
  await withProject({ ...VUE_PROJECT, ".storybook/main.ts": `export default { addons: ["@storybook/addon-mcp"], framework: "@storybook/vue3-vite" };` }, async (dir) => {
    const r = await runDoctor({ project: dir }, deps({ fetch: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch }));
    assert.equal(r.ok, false);
    assert.equal(byId(r, "features")?.status, "fail");
    assert.match(byId(r, "features")?.fix ?? "", /storysync init/);
    assert.equal(byId(r, "storybook-running")?.status, "fail");
    assert.match(byId(r, "storybook-running")?.fix ?? "", /npm run storybook/);
    assert.equal(byId(r, "mcp")?.status, "skip");
  });
});

test("doctor: the Storybook URL comes from the config, unless a flag or env var gives one", async () => {
  await withProject({ ...VUE_PROJECT, [CONFIG_FILE]: JSON.stringify({ storybook: { url: "http://localhost:6007" } }) }, async (dir) => {
    assert.deepEqual((await runDoctor({ project: dir }, deps())).storybookUrl, { value: "http://localhost:6007", from: "config" });
    assert.deepEqual((await runDoctor({ project: dir }, deps({ env: { STORYSYNC_STORYBOOK_URL: "http://localhost:6008" } }))).storybookUrl, { value: "http://localhost:6008", from: "env" });
    assert.deepEqual((await runDoctor({ project: dir, storybookFlag: "http://localhost:6009" }, deps())).storybookUrl, { value: "http://localhost:6009", from: "flag" });
  });
});

test("doctor: MCP without docs tools gets the project's own diagnosis; no browser or Claude is reported with a fix", async () => {
  await withProject(VUE_PROJECT, async (dir) => {
    const r = await runDoctor({ project: dir }, deps({
      inspectMcp: async () => ({ tools: ["preview-stories"], components: null }),
      launchBrowser: async () => { throw new Error("No Chromium-based browser found"); },
      claudeVersion: async () => null,
    }));
    assert.equal(byId(r, "mcp")?.status, "fail");
    assert.match(byId(r, "mcp")?.fix ?? "", /look right|Restart Storybook/);
    assert.equal(byId(r, "browser")?.status, "fail");
    assert.equal(byId(r, "claude-code")?.status, "warn");
  });
});
