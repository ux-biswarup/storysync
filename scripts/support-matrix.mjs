// Rewrites the framework table in README.md from cli/frameworks.ts (plan item 2.7).
// Run after `pnpm build`: pnpm docs:support. A test fails when the README is stale.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { updateSupportMatrix } from "../dist/cli/frameworks.js";

const readme = fileURLToPath(new URL("../README.md", import.meta.url));
const before = readFileSync(readme, "utf8");
const after = updateSupportMatrix(before);
if (after === before) {
  console.log("README support matrix is up to date.");
} else {
  writeFileSync(readme, after);
  console.log("Updated the README support matrix.");
}
