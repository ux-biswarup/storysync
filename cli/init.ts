// `storysync init` — detect Storybook MCP setup gaps and offer to fix them.

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import type { Interface } from "node:readline";
import chalk from "chalk";
import { frameworkProfile, missingFeatures } from "./frameworks.js";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface StorybookConfigFile {
  path: string;
  content: string;
}

const MIN_STORYBOOK_MAJOR = 10;

// addon-mcp moved into the Storybook monorepo at 10.6 and now releases in
// lockstep with it: each version requires Storybook at or above its own
// (10.6.0 peers on `storybook@^10.6.0`) and imports Storybook internals that
// 10.5 does not ship. 0.7, the last release on its own numbering, accepts any
// Storybook 10. An unpinned install takes `latest`, which on a 10.5 project
// fails with ERESOLVE under npm — or, with `storybook@^10.5.0` in
// package.json, quietly upgrades storybook past its framework package.
//
// The first lockstep release was 10.6.0-alpha.4: Storybook's 10.6.0-alpha.0
// to alpha.3 have no addon-mcp of their own version, so they get 0.7 too.
const ADDON_MCP_FIRST_LOCKSTEP = "10.6.0-alpha.4";
const ADDON_MCP_PRE_LOCKSTEP_RANGE = "^0.7.0";

/**
 * The package manager whose lockfile is nearest the project. Looks upward, as
 * the action does, since a package in a workspace has none of its own: npm
 * run there can't install a `workspace:` dependency, and otherwise writes a
 * second lockfile and node_modules beside the workspace's. Stops at the
 * repository root, so a stray lockfile above it is not taken for the
 * project's. npm when there is none.
 */
export function detectPackageManager(projectPath: string): PackageManager {
  for (let dir = resolve(projectPath); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(dir, "yarn.lock"))) return "yarn";
    if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) return "bun";
    if (existsSync(join(dir, "package-lock.json")) || existsSync(join(dir, "npm-shrinkwrap.json"))) return "npm";
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return "npm";
  }
}

export function findStorybookConfig(projectPath: string): StorybookConfigFile | null {
  for (const name of ["main.ts", "main.js", "main.mts", "main.mjs"]) {
    const p = join(projectPath, ".storybook", name);
    if (existsSync(p)) return { path: p, content: readFileSync(p, "utf8") };
  }
  return null;
}

interface ProjectPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * The project's package.json, or null when it has none. One that doesn't
 * parse is an error naming the file, which init reports and exits 1 on.
 * A leading BOM is dropped, as npm and pnpm drop it.
 */
function readProjectPackageJson(projectPath: string): ProjectPackageJson | null {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return null;
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new Error(`${pkgPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error(`${pkgPath} is not a JSON object`);
  return pkg as ProjectPackageJson;
}

export function getStorybookVersion(projectPath: string): string | null {
  const pkg = readProjectPackageJson(projectPath);
  if (!pkg) return null;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps["storybook"]) return deps["storybook"];
  const framework = Object.entries(deps).find(([name]) => name.startsWith("@storybook/"));
  return framework?.[1] ?? null;
}

/**
 * The version of a package installed for the project, read from node_modules.
 * Looks upward, the way Node resolves it, so a workspace package finds a
 * hoisted install. Null before the project has been installed.
 */
function getInstalledVersion(projectPath: string, name: string): string | null {
  let dir = resolve(projectPath);
  for (;;) {
    const pkgPath = join(dir, "node_modules", name, "package.json");
    if (existsSync(pkgPath)) {
      try {
        return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string }).version ?? null;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The version of `name` the project's lockfile pins, or null when there is no
 * lockfile, it doesn't list the package, or it is bun's binary lockfile. Finds
 * the lockfile as detectPackageManager does. Where a lockfile holds several
 * versions of the package, the newest.
 *
 * This is the version an install ends up with: node_modules can lag behind its
 * lockfile, and running the package manager to add addon-mcp also brings
 * node_modules back in line with it.
 */
export function getLockedVersion(projectPath: string, name: string): { version: string; lockfile: string } | null {
  for (let dir = resolve(projectPath); ; dir = dirname(dir)) {
    for (const file of ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "npm-shrinkwrap.json"]) {
      const path = join(dir, file);
      if (!existsSync(path)) continue;
      const versions = lockedVersions(readFileSync(path, "utf8"), file, name);
      const newest = versions
        .map((v) => ({ v, parsed: parseStorybookVersion(v) }))
        .filter((x): x is { v: string; parsed: ParsedVersion } => x.parsed != null)
        .sort((a, b) => compareVersions(b.parsed, a.parsed))[0];
      return newest ? { version: newest.v, lockfile: file } : null;
    }
    if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) return null;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

function lockedVersions(content: string, file: string, name: string): string[] {
  const n = escapeRegExp(name);
  if (file.endsWith(".json")) {
    try {
      const lock = JSON.parse(content) as { packages?: Record<string, { version?: string }>; dependencies?: Record<string, { version?: string }> };
      const v = lock.packages?.[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version;
      return v ? [v] : [];
    } catch {
      return [];
    }
  }
  if (file === "pnpm-lock.yaml") {
    // `  storybook@10.6.0:` and `  '@storybook/addon-mcp@10.6.1(…)':` (v9), or `  /storybook/10.6.0:` (v6).
    const re = new RegExp(`^ {2}['"]?(?:${n}@|/${n}/)(\\d[^:'"(\\s]*)`, "gm");
    return [...content.matchAll(re)].map((m) => m[1]);
  }
  // yarn.lock: a block whose header names `name@…`, then `version "x"` (v1) or `version: x` (berry).
  const re = new RegExp(`^"?(?:[^\\n]*[ ,"])?${n}@[^\\n]*:\\n(?:[ \\t]+[^\\n]*\\n)*?[ \\t]+version:? "?([^"\\n]+)"?`, "gm");
  return [...content.matchAll(re)].map((m) => m[1].trim());
}

/** The version of Storybook installed for the project; see getInstalledVersion. */
export function getInstalledStorybookVersion(projectPath: string): string | null {
  return getInstalledVersion(projectPath, "storybook");
}

/** The version of @storybook/addon-mcp installed for the project; see getInstalledVersion. */
export function getInstalledAddonMcpVersion(projectPath: string): string | null {
  return getInstalledVersion(projectPath, "@storybook/addon-mcp");
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  floor: string;
}

/**
 * Reads an installed version (`10.6.0`) or a declared range (`^10.6.0`) as the
 * lowest version it allows. Null for anything else (`latest`, `workspace:*`).
 */
function parseStorybookVersion(version: string | null): ParsedVersion | null {
  const m = version?.replace(/^[\^~>=<\s]*/, "").match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3] ?? "0", 10),
    prerelease: m[4] ? m[4].split(".") : [],
    floor: `${m[1]}.${m[2]}.${m[3] ?? "0"}${m[4] ? `-${m[4]}` : ""}`,
  };
}

/** Orders two parsed versions by semver precedence: negative when `a` is older. */
function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core) return core;
  // A release is newer than any of its prereleases (10.6.0 > 10.6.0-beta.3).
  if (!a.prerelease.length || !b.prerelease.length) return b.prerelease.length - a.prerelease.length;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    const order = numeric ? parseInt(x, 10) - parseInt(y, 10) : x < y ? -1 : x > y ? 1 : 0;
    if (order) return order;
  }
  return 0;
}

const FIRST_LOCKSTEP = parseStorybookVersion(ADDON_MCP_FIRST_LOCKSTEP)!;

export function isStorybookVersionOk(version: string | null): boolean {
  const v = parseStorybookVersion(version);
  if (!v) return false;
  return v.major > MIN_STORYBOOK_MAJOR || (v.major === MIN_STORYBOOK_MAJOR && v.minor >= 1);
}

/**
 * The `@storybook/addon-mcp` install spec that fits a project's Storybook
 * version: from 10.6 the addon's version equal to Storybook's, since a later
 * one would require a later Storybook; before that, 0.7. Unpinned when the
 * version is unknown.
 */
export function addonMcpInstallSpec(storybookVersion: string | null): string {
  const v = parseStorybookVersion(storybookVersion);
  if (!v) return "@storybook/addon-mcp";
  const lockstep = compareVersions(v, FIRST_LOCKSTEP) >= 0;
  return `@storybook/addon-mcp@${lockstep ? v.floor : ADDON_MCP_PRE_LOCKSTEP_RANGE}`;
}

/**
 * Whether an installed addon-mcp requires a newer Storybook than the project
 * has: a lockstep release (10.6 on) newer than Storybook, which it peers on
 * at its own version or later. Storybook fails to load its preset, so the
 * addon looks installed while nothing works. An older init installed it
 * unpinned, which put 10.6 on Storybook 10.5 projects.
 */
export function addonMcpNeedsNewerStorybook(addonVersion: string | null, storybookVersion: string | null): boolean {
  const addon = parseStorybookVersion(addonVersion);
  const storybook = parseStorybookVersion(storybookVersion);
  if (!addon || !storybook) return false;
  return compareVersions(addon, FIRST_LOCKSTEP) >= 0 && compareVersions(addon, storybook) > 0;
}

export function hasAddonMcpInPackageJson(projectPath: string): boolean {
  const pkg = readProjectPackageJson(projectPath);
  if (!pkg) return false;
  return Boolean(pkg.devDependencies?.["@storybook/addon-mcp"] || pkg.dependencies?.["@storybook/addon-mcp"]);
}

/**
 * `content` with each comment blanked out, newlines kept, so an offset in it
 * is an offset in `content`. Strings are copied as they are: a stories glob
 * holds a slash-star and a URL holds `//`. A backslash outside a string, as
 * in a regex like `/https?:\/\//`, escapes the character after it.
 */
function maskComments(content: string): string {
  let out = "";
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    let end = i + 1;
    if (c === "/" && (content[i + 1] === "/" || content[i + 1] === "*")) {
      const line = content[i + 1] === "/";
      const close = line ? content.indexOf("\n", i) : content.indexOf("*/", i + 2);
      end = close < 0 ? content.length : line ? close : close + 2;
      out += content.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // Up to the closing quote. A '' or "" string can't span lines, so one
      // left open ends at the line's end.
      while (end < content.length && content[end] !== c && (c === "`" || content[end] !== "\n")) {
        end += content[end] === "\\" ? 2 : 1;
      }
      end++;
    } else if (c === "\\") {
      end++;
    }
    out += content.slice(i, end);
    i = end;
  }
  return out;
}

/** Whether addon-mcp is in the config, outside a comment. */
export function hasAddonMcpInConfig(content: string): boolean {
  return /["']@storybook\/addon-mcp["']/.test(maskComments(content));
}

/**
 * Adds addon-mcp at the start of the `addons` array. One commented out, often
 * left beside the real one, is passed over: written into, it uncomments the
 * line it lands on and breaks the file, or never loads.
 */
export function addAddonToConfig(content: string): { content: string; ok: boolean } {
  // The key may be quoted, as Storybook's own installer writes it: `"addons": [`.
  const m = /(?:^|[\s,{(])(["']?)addons\1\s*:\s*\[/m.exec(maskComments(content));
  if (!m) return { content, ok: false };
  const insertAt = m.index + m[0].length;
  const entry = `\n    { name: "@storybook/addon-mcp", options: { toolsets: { docs: true } } },`;
  return { content: content.slice(0, insertAt) + entry + content.slice(insertAt), ok: true };
}

/**
 * Turns `flag` on in the config's `features`: inside an existing `features: {`,
 * or as a new `features` entry just before `framework`. Keys are quoted when
 * the config quotes its own. Not ok when neither is found.
 */
export function addFeatureToConfig(content: string, flag: string): { content: string; ok: boolean } {
  const masked = maskComments(content);
  const existing = /(?:^|[\s,{(])(["']?)features\1\s*:\s*\{/m.exec(masked);
  if (existing) {
    const q = existing[1];
    const at = existing.index + existing[0].length;
    return { content: `${content.slice(0, at)} ${q}${flag}${q}: true,${content.slice(at)}`, ok: true };
  }
  const framework = /(^|[\s,{(])(["']?)framework\2\s*:/m.exec(masked);
  if (!framework) return { content, ok: false };
  const q = framework[2];
  const at = framework.index + framework[1].length;
  const indent = /[^\S\n]*$/.exec(content.slice(0, at))?.[0] ?? "";
  const entry = `${q}features${q}: { ${q}${flag}${q}: true },\n${indent}`;
  return { content: content.slice(0, at) + entry + content.slice(at), ok: true };
}

/** The ports `storybook dev` takes: 6006, or the next free one when it's taken. */
const STORYBOOK_PORTS = [6006, 6007, 6008, 6009, 6010];

/**
 * Storybook dev servers answering on this machine, by URL. On Windows an
 * install while one runs can fail with EPERM, since it holds files in
 * node_modules open. A server is one whose /index.json lists stories.
 */
export async function findRunningStorybooks(
  fetchImpl: typeof fetch = fetch,
  ports: number[] = STORYBOOK_PORTS,
): Promise<string[]> {
  const found = await Promise.all(ports.map(async (port) => {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetchImpl(`${url}/index.json`, { signal: AbortSignal.timeout(800) });
      if (!res.ok) return null;
      const body = (await res.json()) as { entries?: unknown };
      return body && typeof body === "object" && body.entries ? url : null;
    } catch {
      return null;
    }
  }));
  return found.filter((u): u is string => u != null);
}

/** Feature flags `features` sets to true in a Storybook main config, outside comments. */
export function enabledFeatures(configContent: string): Set<string> {
  const masked = maskComments(configContent);
  const on = new Set<string>();
  for (const m of masked.matchAll(/(["']?)(\w+)\1\s*:\s*true\b/g)) on.add(m[2]);
  return on;
}

/** The framework package a Storybook main config names, e.g. `@storybook/vue3-vite`. */
export function configFramework(configContent: string): string | null {
  const m = /(["']?)framework\1\s*:\s*(?:\{[^}]*?(["']?)name\2\s*:\s*)?["'](@storybook\/[\w-]+)["']/.exec(maskComments(configContent));
  return m?.[3] ?? null;
}

/**
 * Why Storybook MCP has no docs tools, for the project in `projectPath`, as
 * lines to show the user. The docs tools appear only when Storybook builds a
 * component manifest: `features.componentsManifest` (which addon-mcp 10.6+
 * turns on itself), and for Vue also `features.experimentalDocgenServer`,
 * without which `@storybook/vue3-vite` returns no manifest. Says a version is
 * too old only when it is.
 */
export function diagnoseMissingDocsTools(projectPath: string): string[] {
  const config = findStorybookConfig(projectPath);
  if (!config) {
    return [
      "Storysync couldn't check the setup: there's no .storybook/main.* here.",
      "Run this command from the Storybook project's folder to see what's missing, or run `storysync init` there.",
    ];
  }
  const version = getInstalledStorybookVersion(projectPath) ?? getStorybookVersion(projectPath);
  if (!isStorybookVersionOk(version)) {
    return [
      `Storybook ${version ?? "(not found)"} is too old: the docs tools need Storybook 10.1 or later.`,
      // npx ships with Node, and Storybook's upgrade finds the package manager itself.
      "Upgrade with: npx storybook@latest upgrade",
    ];
  }
  const features = enabledFeatures(config.content);
  const framework = configFramework(config.content);
  // addon-mcp 10.6 and later turns componentsManifest on itself; 0.7 doesn't.
  const addon = parseStorybookVersion(getInstalledAddonMcpVersion(projectPath));
  const addonEnablesManifest = addon != null && compareVersions(addon, FIRST_LOCKSTEP) >= 0;
  const missing: string[] = [];
  if (!addonEnablesManifest && !features.has("componentsManifest") && !features.has("experimentalComponentsManifest")) missing.push("componentsManifest: true");
  const profile = frameworkProfile(framework);
  const frameworkMissing = missingFeatures(profile, features);
  for (const f of frameworkMissing) missing.push(`${f}: true`);
  const file = relative(projectPath, config.path);
  if (!missing.length) {
    return [
      `Storybook ${version} and ${file} look right for the docs tools.`,
      "Restart Storybook if you changed its config since it started, and check addon-mcp is registered: `storysync init`.",
    ];
  }
  const reasons = frameworkMissing.map((f) => profile?.featureReasons[f]).filter(Boolean);
  const why = reasons.length ? ` (${reasons.join("; ")})` : "";
  return [
    `Storybook ${version} is new enough. The docs tools are off because ${file} doesn't turn on the component manifest${why}.`,
    `Add to ${file}:  features: { ${missing.join(", ")} }`,
    "Then restart Storybook.",
  ];
}

// One reader of stdin for every prompt. A readline interface per prompt lost
// piped answers: given "n\ny\n", the first read both lines, took its answer
// and closed, and the second prompt was left waiting for input already gone,
// so init exited without registering the addon.
let answers: { rl: Interface; lines: AsyncIterableIterator<string> } | null = null;

/** The next line of input, or null when input has ended. */
async function nextAnswer(): Promise<string | null> {
  if (!answers) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    answers = { rl, lines: rl[Symbol.asyncIterator]() };
  }
  const next = await answers.lines.next();
  return next.done ? null : next.value;
}

export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  process.stdout.write(`${message} ${chalk.dim(defaultYes ? "[Y/n]" : "[y/N]")} `);
  const line = await nextAnswer();
  if (line === null) {
    // Input ended with no answer: nothing was agreed to.
    process.stdout.write("\n");
    return false;
  }
  const a = line.trim().toLowerCase();
  return a === "" ? defaultYes : a === "y" || a === "yes";
}

/** Asks for a value; an empty answer, or input that has ended, takes the default. */
export async function ask(message: string, defaultValue: string): Promise<string> {
  process.stdout.write(`${message}${defaultValue ? ` ${chalk.dim(`[${defaultValue}]`)}` : ""} `);
  const line = await nextAnswer();
  if (line === null) process.stdout.write("\n");
  return line?.trim() || defaultValue;
}

/** Stops reading stdin, if a prompt started to, so the process can exit. */
export function closeAnswers(): void {
  answers?.rl.close();
  answers = null;
}

/**
 * The command that installs `spec`, as run and as printed for running by
 * hand. A spec with a range in it is quoted: zsh with extendedglob reads
 * `^0.7.0` as a glob and fails with "no matches found". Double quotes, since
 * cmd.exe, which runs it on Windows, keeps single quotes as part of the name.
 */
export function installCommand(pm: PackageManager, spec: string): string {
  const arg = /^[\w@/.:+-]+$/.test(spec) ? spec : `"${spec}"`;
  if (pm === "pnpm") return `pnpm add -D ${arg}`;
  if (pm === "yarn") return `yarn add -D ${arg}`;
  if (pm === "bun") return `bun add -d ${arg}`;
  return `npm install -D ${arg}`;
}

/**
 * `command` as typed where init was run. From another directory it first
 * changes into the project, since the package manager and Storybook act on
 * the directory they run in: pasted as it was, `pnpm add` added to the
 * package.json there.
 */
function inProject(command: string, projectPath: string): string {
  // Real paths on both sides: the working directory is one (/private/var on
  // macOS), and a project named through a symlink would read as elsewhere.
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  let dir = relative(real(process.cwd()), real(projectPath));
  if (!dir) return command;
  if (dir.startsWith("-")) dir = `./${dir}`;
  // Quoted as installCommand quotes a spec, for cmd.exe as well as sh.
  return `cd ${/^[\w@/.:+\\-]+$/.test(dir) ? dir : `"${dir}"`} && ${command}`;
}

/** Asks before installing `spec`. A failed install ends init with exit code 1. */
async function offerInstall(pm: PackageManager, spec: string, projectPath: string): Promise<"installed" | "skipped" | "failed"> {
  const command = installCommand(pm, spec);
  if (!(await confirm(`Install ${spec} via ${pm}?`))) {
    console.log(chalk.dim(`  Skipped. Run manually: ${inProject(command, projectPath)}`));
    return "skipped";
  }
  try {
    execSync(command, { cwd: projectPath, stdio: "inherit" });
    return "installed";
  } catch (err) {
    console.log(chalk.red(`Install failed: ${String(err)}`));
    process.exitCode = 1;
    return "failed";
  }
}

function upgradeCommand(pm: PackageManager): string {
  if (pm === "pnpm") return "pnpm dlx storybook@latest upgrade";
  if (pm === "yarn") return "npx storybook@latest upgrade";
  if (pm === "bun") return "bunx storybook@latest upgrade";
  return "npx storybook@latest upgrade";
}

export async function runInit(projectInput: string): Promise<void> {
  try {
    await checkAndFix(projectInput);
  } catch (err) {
    // Said as the other commands say an error that ends them, not as a stack.
    console.error(chalk.red(`\n${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
  } finally {
    closeAnswers();
  }
}

/** init's checks and fixes, without closing input: the wizard asks more afterwards. */
export async function checkAndFix(projectInput: string): Promise<void> {
  const projectPath = resolve(projectInput);
  console.log(chalk.bold("\nstorysync init"));
  console.log(chalk.dim(`Project: ${projectPath}\n`));

  const config = findStorybookConfig(projectPath);
  if (!config) {
    console.log(chalk.red("✖ No Storybook config found at .storybook/main.ts"));
    console.log(chalk.dim(`  Initialize Storybook first: ${inProject("npx storybook init", projectPath)}`));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.green("✔") + ` Found ${relative(projectPath, config.path)}`);

  const pm = detectPackageManager(projectPath);

  // What will run after an install: the lockfile's version when it pins one,
  // since installing addon-mcp also brings node_modules in line with the
  // lockfile; else the installed version (`^10.5.0` in package.json may well
  // be 10.6 on disk). Picked from node_modules alone, a stale install got an
  // addon for the old Storybook while the install moved Storybook on.
  const installedVersion = getInstalledStorybookVersion(projectPath);
  const locked = getLockedVersion(projectPath, "storybook");
  const sbVersion = locked?.version ?? installedVersion ?? getStorybookVersion(projectPath);
  const lagging = locked && installedVersion && locked.version !== installedVersion ? { installed: installedVersion, ...locked } : null;
  const sbOk = isStorybookVersionOk(sbVersion);
  const hasAddon = hasAddonMcpInPackageJson(projectPath);
  const addonVersion = hasAddon ? getInstalledAddonMcpVersion(projectPath) : null;
  // Installed, but a release for a newer Storybook, so it doesn't load.
  const addonTooNew = addonMcpNeedsNewerStorybook(addonVersion, sbVersion);
  const inConfig = hasAddonMcpInConfig(config.content);
  // Flags this framework needs for the docs tools (e.g. Vue's
  // experimentalDocgenServer), from its profile.
  const profile = frameworkProfile(configFramework(config.content));
  const missingFlags = missingFeatures(profile, enabledFeatures(config.content));

  const addonMark = addonTooNew ? chalk.red("✖") : hasAddon ? chalk.green("✔") : chalk.yellow("✖");
  console.log(`${sbOk ? chalk.green("✔") : chalk.red("✖")} Storybook 10.1+ ${chalk.dim(sbVersion ? `(found ${sbVersion})` : "(not found)")}`);
  console.log(`${addonMark} @storybook/addon-mcp installed${addonVersion ? ` ${chalk.dim(`(found ${addonVersion})`)}` : ""}`);
  console.log(`${inConfig ? chalk.green("✔") : chalk.yellow("✖")} addon-mcp registered in addons array`);
  for (const flag of profile?.requiredFeatures ?? []) {
    const on = !missingFlags.includes(flag);
    console.log(`${on ? chalk.green("✔") : chalk.yellow("✖")} ${flag} on ${chalk.dim(`(${profile!.label} needs it for the docs tools)`)}`);
  }
  console.log("");

  if (sbOk && hasAddon && !addonTooNew && inConfig && !missingFlags.length) {
    console.log(chalk.green("Everything looks good. Restart Storybook if it's running."));
    return;
  }

  if (!sbOk) {
    console.log(chalk.red(`storysync requires Storybook 10.1+ for component sync (list, map, inspect, diff).`));
    console.log(chalk.red(`Token extraction (storysync tokens) works with any version.`));
    console.log(chalk.dim(`\n  Upgrade: ${inProject(upgradeCommand(pm), projectPath)}\n`));
    process.exitCode = 1;
  }

  let updatedContent = config.content;
  let configChanged = false;
  let installed = false;

  if (!hasAddon || addonTooNew) {
    const spec = addonMcpInstallSpec(sbVersion);
    if (lagging) {
      console.log(chalk.yellow(
        `node_modules has Storybook ${lagging.installed}, but ${lagging.lockfile} pins ${lagging.version}. ` +
        `Installing will also bring node_modules up to date with ${lagging.lockfile}, so addon-mcp is matched to ${lagging.version}.`,
      ));
    }
    const running = await findRunningStorybooks();
    if (running.length) {
      console.log(chalk.yellow(
        `A Storybook is running at ${running.join(", ")}. If one is this project's, stop it before installing: ` +
        `on Windows, files it holds open can make the install fail (EPERM). Start it again afterwards.`,
      ));
    }
    if (addonTooNew) {
      console.log(chalk.red(
        `@storybook/addon-mcp ${addonVersion} needs Storybook ${addonVersion} or later, ` +
        `but this project has Storybook ${sbVersion}, so Storybook can't load the addon.`,
      ));
    }
    const outcome = await offerInstall(pm, spec, projectPath);
    if (outcome === "failed") return;
    installed = outcome === "installed";
    if (addonTooNew && !installed) {
      // Declined: the addon is left as it is, and it still doesn't load.
      console.log(chalk.dim(`  Or upgrade Storybook: ${inProject(upgradeCommand(pm), projectPath)}`));
      process.exitCode = 1;
    }
  }

  if (!inConfig) {
    const yes = await confirm(`Add @storybook/addon-mcp to .storybook/main config?`);
    if (yes) {
      const result = addAddonToConfig(updatedContent);
      if (result.ok) {
        updatedContent = result.content;
        configChanged = true;
      } else {
        console.log(chalk.yellow("  Couldn't locate `addons: [` in your config. Add this manually:"));
        console.log(chalk.dim(`    { name: "@storybook/addon-mcp", options: { toolsets: { docs: true } } }`));
      }
    }
  }

  for (const flag of missingFlags) {
    const yes = await confirm(`Turn on features.${flag} in .storybook/main config? (${profile!.label} needs it for the docs tools)`);
    if (yes) {
      const result = addFeatureToConfig(updatedContent, flag);
      if (result.ok) {
        updatedContent = result.content;
        configChanged = true;
      } else {
        console.log(chalk.yellow("  Couldn't find `features` or `framework` in your config. Add this manually:"));
        console.log(chalk.dim(`    features: { ${flag}: true }`));
      }
    }
  }

  if (configChanged) {
    writeFileSync(config.path, updatedContent);
    console.log(chalk.green(`\n✔ Updated ${relative(projectPath, config.path)}`));
  }

  if (configChanged || installed) {
    console.log(chalk.dim("\nRestart Storybook to apply changes, then run:"));
    console.log(chalk.dim("  storysync list"));
  }
}
