// Phase 1 of docs/plans/implementation-plan.md: the setup problems the Vue
// field test hit (docs/research/2026-10-07-vue-library-field-test.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  addAddonToConfig,
  addFeatureToConfig,
  configFramework,
  diagnoseMissingDocsTools,
  findRunningStorybooks,
  getLockedVersion,
} from "../init.js";

function withProject(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "storysync-init-setup-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- 1.1: quoted keys, as Storybook's own installer writes them ---

const QUOTED_MAIN = `import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.stories.@(js|mjs|ts)"
  ],
  "addons": [
    "@storybook/addon-docs"
  ],
  "framework": {
    "name": "@storybook/vue3-vite",
    "options": {}
  }
};
export default config;
`;

test("addAddonToConfig: finds a quoted \"addons\" key", () => {
  const r = addAddonToConfig(QUOTED_MAIN);
  assert.equal(r.ok, true);
  assert.match(r.content, /"addons": \[\n {4}\{ name: "@storybook\/addon-mcp"[^\n]*\n {4}"@storybook\/addon-docs"/);
});

test("addAddonToConfig: finds a single-quoted 'addons' key", () => {
  const r = addAddonToConfig(`export default { 'addons': [], framework: '@storybook/react-vite' };`);
  assert.equal(r.ok, true);
  assert.match(r.content, /'addons': \[\n {4}\{ name: "@storybook\/addon-mcp"/);
});

test("addAddonToConfig: a key that only ends in addons is not taken for it", () => {
  const r = addAddonToConfig(`export default { "my-addons": [], framework: "@storybook/react-vite" };`);
  assert.equal(r.ok, false);
});

// --- the Vue flag ---

test("addFeatureToConfig: adds a features entry before framework, quoted like the config", () => {
  const r = addFeatureToConfig(QUOTED_MAIN, "experimentalDocgenServer");
  assert.equal(r.ok, true);
  assert.match(r.content, /\n {2}"features": \{ "experimentalDocgenServer": true \},\n {2}"framework": \{/);
});

test("addFeatureToConfig: adds to an existing features object", () => {
  const r = addFeatureToConfig(`export default {\n  features: { componentsManifest: true },\n  framework: "@storybook/vue3-vite",\n};`, "experimentalDocgenServer");
  assert.equal(r.ok, true);
  assert.match(r.content, /features: \{ experimentalDocgenServer: true, componentsManifest: true \}/);
});

test("addFeatureToConfig: not ok when there is neither features nor framework", () => {
  assert.equal(addFeatureToConfig(`export default {};`, "experimentalDocgenServer").ok, false);
});

test("configFramework: reads the framework name, quoted or not, as a string or an object", () => {
  assert.equal(configFramework(QUOTED_MAIN), "@storybook/vue3-vite");
  assert.equal(configFramework(`export default { framework: "@storybook/react-vite" };`), "@storybook/react-vite");
  assert.equal(configFramework(`export default { framework: { name: '@storybook/sveltekit', options: {} } };`), "@storybook/sveltekit");
});

// --- 1.2: versions from the lockfile ---

test("getLockedVersion: package-lock.json v3", () => {
  withProject({ "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/storybook": { version: "10.6.0" } } }) }, (dir) => {
    assert.deepEqual(getLockedVersion(dir, "storybook"), { version: "10.6.0", lockfile: "package-lock.json" });
  });
});

test("getLockedVersion: pnpm-lock.yaml v9, scoped and unscoped, newest of several", () => {
  const lock = [
    "lockfileVersion: '9.0'",
    "packages:",
    "  storybook@10.5.5:",
    "    resolution: {integrity: sha512-x}",
    "  storybook@10.6.0(prettier@3.0.0):",
    "    resolution: {integrity: sha512-y}",
    "  '@storybook/addon-mcp@10.6.1':",
    "    resolution: {integrity: sha512-z}",
    "",
  ].join("\n");
  withProject({ "pnpm-lock.yaml": lock }, (dir) => {
    assert.equal(getLockedVersion(dir, "storybook")?.version, "10.6.0");
    assert.equal(getLockedVersion(dir, "@storybook/addon-mcp")?.version, "10.6.1");
  });
});

test("getLockedVersion: yarn.lock v1 and berry", () => {
  withProject({ "yarn.lock": `storybook@^10.3.6:\n  version "10.6.0"\n  resolved "https://x"\n` }, (dir) => {
    assert.equal(getLockedVersion(dir, "storybook")?.version, "10.6.0");
  });
  withProject({ "yarn.lock": `"storybook@npm:^10.3.6":\n  version: 10.6.0\n  resolution: "storybook@npm:10.6.0"\n` }, (dir) => {
    assert.equal(getLockedVersion(dir, "storybook")?.version, "10.6.0");
  });
});

test("getLockedVersion: null when the lockfile doesn't list the package", () => {
  withProject({ "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" }, (dir) => {
    assert.equal(getLockedVersion(dir, "storybook"), null);
  });
});

// --- 1.3: a running Storybook ---

test("findRunningStorybooks: lists the ports whose /index.json has entries", async () => {
  const fakeFetch = (async (url: string) => {
    if (url.startsWith("http://localhost:6007/")) return new Response(JSON.stringify({ v: 5, entries: {} }));
    if (url.startsWith("http://localhost:6008/")) return new Response("<html>", { status: 200 });
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  assert.deepEqual(await findRunningStorybooks(fakeFetch, [6006, 6007, 6008]), ["http://localhost:6007"]);
});

// --- 1.4: why the docs tools are missing ---

const VUE_MAIN = `export default { addons: ["@storybook/addon-mcp"], framework: { name: "@storybook/vue3-vite" } };`;

test("diagnoseMissingDocsTools: a Vue project without experimentalDocgenServer is told to add it, not to upgrade", () => {
  withProject({
    ".storybook/main.ts": VUE_MAIN,
    "node_modules/storybook/package.json": JSON.stringify({ version: "10.6.0" }),
    "node_modules/@storybook/addon-mcp/package.json": JSON.stringify({ version: "10.6.0" }),
  }, (dir) => {
    const advice = diagnoseMissingDocsTools(dir).join("\n");
    assert.match(advice, /Storybook 10\.6\.0 is new enough/);
    assert.match(advice, /features: \{ experimentalDocgenServer: true \}/);
    // addon-mcp 10.6 turns componentsManifest on itself.
    assert.doesNotMatch(advice, /componentsManifest/);
    assert.doesNotMatch(advice, /upgrade/i);
  });
});

test("diagnoseMissingDocsTools: addon-mcp 0.7 needs componentsManifest set in the config", () => {
  withProject({
    ".storybook/main.ts": `export default { addons: ["@storybook/addon-mcp"], framework: "@storybook/react-vite" };`,
    "node_modules/storybook/package.json": JSON.stringify({ version: "10.5.5" }),
    "node_modules/@storybook/addon-mcp/package.json": JSON.stringify({ version: "0.7.0" }),
  }, (dir) => {
    assert.match(diagnoseMissingDocsTools(dir).join("\n"), /features: \{ componentsManifest: true \}/);
  });
});

test("diagnoseMissingDocsTools: a config with everything on says to restart and run init", () => {
  withProject({
    ".storybook/main.ts": `export default { features: { experimentalDocgenServer: true }, addons: ["@storybook/addon-mcp"], framework: "@storybook/vue3-vite" };`,
    "node_modules/storybook/package.json": JSON.stringify({ version: "10.6.0" }),
    "node_modules/@storybook/addon-mcp/package.json": JSON.stringify({ version: "10.6.0" }),
  }, (dir) => {
    assert.match(diagnoseMissingDocsTools(dir).join("\n"), /look right[\s\S]*Restart Storybook[\s\S]*storysync init/);
  });
});

test("diagnoseMissingDocsTools: an old Storybook is told to upgrade, with npx", () => {
  withProject({
    ".storybook/main.ts": `export default { framework: "@storybook/react-vite" };`,
    "node_modules/storybook/package.json": JSON.stringify({ version: "9.1.0" }),
  }, (dir) => {
    const advice = diagnoseMissingDocsTools(dir).join("\n");
    assert.match(advice, /9\.1\.0 is too old/);
    assert.match(advice, /npx storybook@latest upgrade/);
  });
});

test("diagnoseMissingDocsTools: outside a Storybook project, says where to run it", () => {
  withProject({ "package.json": "{}" }, (dir) => {
    assert.match(diagnoseMissingDocsTools(dir).join("\n"), /no \.storybook\/main\.\* here[\s\S]*storysync init/);
  });
});
