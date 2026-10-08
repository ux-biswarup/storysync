// Phase 1 of docs/plans/implementation-plan.md: token sources as the Vue field
// test found them (docs/research/2026-10-07-vue-library-field-test.md): a
// Tailwind v4 stub config beside the CSS that holds the tokens.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { detectTokenSource, extractTokens, hasTailwindTheme, summarizeUncategorized } from "../tokens.js";

function withProject(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "storysync-token-sources-"));
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

// A v4 config kept only for content paths and plugins. Its comment mentions
// the theme, which must not count as one.
const STUB_CONFIG = `import type { Config } from 'tailwindcss';
/**
 * In Tailwind v4, theme values are defined in CSS using the @theme directive.
 */
export default {
  content: ['./src/**/*.{vue,ts}'],
  plugins: [],
} satisfies Config;
`;
const ROOT_CSS = `:root {\n  --color-primary: #395aec;\n  --color-text: #03324b;\n}\n`;
const THEME_CSS = `@import "tailwindcss";\n@theme {\n  --color-brand: #fb2c36;\n  --radius-card: 0.75rem;\n}\n`;

test("hasTailwindTheme: a v4 stub config has none, even when its comments say 'theme'", () => {
  withProject({ "tailwind.config.ts": STUB_CONFIG }, (dir) => {
    assert.equal(hasTailwindTheme(join(dir, "tailwind.config.ts")), false);
  });
  withProject({ "tailwind.config.js": `module.exports = { theme: { extend: { colors: { brand: "#000" } } } };` }, (dir) => {
    assert.equal(hasTailwindTheme(join(dir, "tailwind.config.js")), true);
  });
});

test("detectTokenSource: a stub config no longer hides :root custom properties, and says why", () => {
  withProject({ "tailwind.config.ts": STUB_CONFIG, "src/styles/tokens.css": ROOT_CSS }, (dir) => {
    const found = detectTokenSource(dir);
    assert.equal(found?.type, "css");
    assert.match(found?.reason ?? "", /tailwind\.config\.ts has no theme[\s\S]*:root custom properties/);
    assert.ok(extractTokens(dir).collections.some((c) => c.category === "colors" && c.tokens.length === 2));
  });
});

test("detectTokenSource: a stub config beside @theme reads @theme", () => {
  withProject({ "tailwind.config.ts": STUB_CONFIG, "src/app.css": THEME_CSS }, (dir) => {
    const found = detectTokenSource(dir);
    assert.equal(found?.type, "tailwind");
    assert.match(found?.path ?? "", /app\.css$/);
    assert.match(found?.reason ?? "", /@theme/);
  });
});

test("extractTokens --source tailwind: reads @theme when the config beside it is a stub", () => {
  withProject({ "tailwind.config.ts": STUB_CONFIG, "src/app.css": THEME_CSS }, (dir) => {
    const result = extractTokens(dir, "tailwind");
    const names = result.collections.flatMap((c) => c.tokens.map((t) => t.name));
    assert.ok(names.includes("brand"), names.join(", "));
    assert.ok(names.includes("card"), names.join(", "));
  });
});

test("detectTokenSource: a config with a theme still comes first", () => {
  withProject({ "tailwind.config.js": `module.exports = { theme: { colors: { brand: "#000" } } };`, "src/tokens.css": ROOT_CSS }, (dir) => {
    assert.equal(detectTokenSource(dir)?.type, "tailwind");
    assert.match(detectTokenSource(dir)?.path ?? "", /tailwind\.config\.js$/);
  });
});

test("summarizeUncategorized: groups variables by name prefix, largest first, and keeps other warnings", () => {
  const s = summarizeUncategorized([
    "Uncategorized: --aura-primitive-border-radius-xs: 2px",
    "Uncategorized: --aura-primitive-border-radius-sm: 4px",
    "Uncategorized: --p-inputtext-sm-font-size: 0.75rem",
    "Uncategorized: --gutter: 4px",
    "Could not resolve var(--missing)",
  ]);
  assert.equal(s.uncategorized, 4);
  assert.deepEqual(s.groups, [
    { prefix: "--aura-primitive-border-radius-*", count: 2 },
    { prefix: "--gutter", count: 1 },
    { prefix: "--p-inputtext-sm-font-*", count: 1 },
  ]);
  assert.deepEqual(s.other, ["Could not resolve var(--missing)"]);
});
