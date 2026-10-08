// `storysync doctor`: checks every link from the project to Storybook, the
// browser, tokens and Claude Code, and says how to fix each one that's broken
// (plan item 2.2, UX principle 6). Returns a result object rather than
// printing, so the CLI, --json and the coming UI show the same facts.

import { relative, resolve } from "node:path";
import chalk from "chalk";
import {
  findStorybookConfig, getInstalledStorybookVersion, getLockedVersion, getStorybookVersion, isStorybookVersionOk,
  hasAddonMcpInPackageJson, getInstalledAddonMcpVersion, addonMcpNeedsNewerStorybook, hasAddonMcpInConfig,
  configFramework, enabledFeatures, diagnoseMissingDocsTools,
} from "./init.js";
import { frameworkProfile, missingFeatures } from "./frameworks.js";
import { loadConfig, resolveSetting, envValue, ENV, CONFIG_FILE, type Setting } from "./config.js";
import { resolveDocsTools, StorybookClient } from "./storybook.js";
import { resolveAndLaunch } from "./snap-browser.js";
import { spawnSync } from "node:child_process";
import { detectTokenSource, extractTokens } from "./tokens.js";

export type CheckStatus = "ok" | "warn" | "fail" | "info" | "skip";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to do, when the status isn't ok. */
  fix?: string;
}

export interface DoctorResult {
  project: string;
  storybookUrl: Setting<string>;
  checks: Check[];
  summary: Record<CheckStatus, number>;
  /** True when nothing failed. */
  ok: boolean;
}

/** Everything doctor reaches outside the file system, so tests can stand in for it. */
export interface DoctorDeps {
  fetch: typeof fetch;
  /** Connects to Storybook MCP and lists its tools and components. */
  inspectMcp(url: string): Promise<{ tools: string[]; components: number | null }>;
  /** Launches and closes the browser snap uses; returns how it was found. */
  launchBrowser(): Promise<string>;
  /** Claude Code's version, or null when it isn't installed. */
  claudeVersion(): Promise<string | null>;
  nodeVersion: string;
  env: NodeJS.ProcessEnv;
}

export interface DoctorOptions {
  project: string;
  /** --storybook, when given. */
  storybookFlag?: string;
}

const DEFAULT_STORYBOOK_URL = "http://localhost:6006";

export async function runDoctor(opts: DoctorOptions, deps: DoctorDeps): Promise<DoctorResult> {
  const project = resolve(opts.project);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // --- Node ---
  const nodeMajor = Number(deps.nodeVersion.replace(/^v/, "").split(".")[0]);
  add(nodeMajor >= 20
    ? { id: "node", label: "Node.js", status: "ok", detail: deps.nodeVersion }
    : nodeMajor >= 18
      ? { id: "node", label: "Node.js", status: "warn", detail: `${deps.nodeVersion}: every command works except snap`, fix: "Install Node 20 or later for snap" }
      : { id: "node", label: "Node.js", status: "fail", detail: deps.nodeVersion, fix: "Install Node 20 or later" });

  // --- Config file ---
  let config: ReturnType<typeof loadConfig>["config"] = {};
  try {
    const loaded = loadConfig(project);
    config = loaded.config;
    add(loaded.path
      ? { id: "config", label: CONFIG_FILE, status: "ok", detail: relative(project, loaded.path) || loaded.path }
      : { id: "config", label: CONFIG_FILE, status: "info", detail: "none (optional: settings can come from flags instead)" });
  } catch (err) {
    add({ id: "config", label: CONFIG_FILE, status: "fail", detail: err instanceof Error ? err.message : String(err), fix: `Fix ${CONFIG_FILE}; its schema is schema.json in the storysync package` });
  }

  const storybookUrl = resolveSetting({
    flag: opts.storybookFlag,
    env: envValue(ENV.storybookUrl, deps.env),
    config: config.storybook?.url,
    fallback: DEFAULT_STORYBOOK_URL,
  });

  // --- The Storybook project on disk ---
  const sbConfig = findStorybookConfig(project);
  if (!sbConfig) {
    add({ id: "storybook-config", label: "Storybook project", status: "fail", detail: `no .storybook/main.* in ${project}`, fix: "Run doctor from your Storybook project's folder, or pass --project" });
  } else {
    add({ id: "storybook-config", label: "Storybook project", status: "ok", detail: relative(project, sbConfig.path) });

    const installed = getInstalledStorybookVersion(project);
    const locked = getLockedVersion(project, "storybook");
    const version = installed ?? locked?.version ?? getStorybookVersion(project);
    if (!isStorybookVersionOk(version)) {
      add({ id: "storybook-version", label: "Storybook 10.1+", status: "fail", detail: version ? `found ${version}` : "not installed", fix: version ? "Upgrade: npx storybook@latest upgrade" : "Install the project's dependencies" });
    } else if (installed && locked && installed !== locked.version) {
      add({ id: "storybook-version", label: "Storybook 10.1+", status: "warn", detail: `node_modules has ${installed}, ${locked.lockfile} pins ${locked.version}`, fix: "Reinstall dependencies so they match the lockfile" });
    } else {
      add({ id: "storybook-version", label: "Storybook 10.1+", status: "ok", detail: `found ${version}` });
    }

    const frameworkPkg = configFramework(sbConfig.content);
    const profile = frameworkProfile(config.framework ?? frameworkPkg);
    if (!profile) {
      add({ id: "framework", label: "Framework", status: "warn", detail: frameworkPkg ? `${frameworkPkg} has no Storysync profile` : "couldn't read the framework from .storybook/main", fix: "Components may still work; tokens do. Report the framework so a profile can be added" });
    } else {
      const support = profile.support === "v1" ? "supported" : profile.support === "works" ? "known to work" : "not yet tested";
      add({ id: "framework", label: "Framework", status: profile.support === "untested" ? "warn" : "ok", detail: `${profile.label}, ${support}${config.framework ? ` (from ${CONFIG_FILE})` : ""}` });
    }

    const hasAddon = hasAddonMcpInPackageJson(project);
    const addonVersion = hasAddon ? getInstalledAddonMcpVersion(project) : null;
    if (!hasAddon) {
      add({ id: "addon-mcp", label: "@storybook/addon-mcp", status: "fail", detail: "not installed", fix: "Run: storysync init" });
    } else if (addonMcpNeedsNewerStorybook(addonVersion, version)) {
      add({ id: "addon-mcp", label: "@storybook/addon-mcp", status: "fail", detail: `${addonVersion} needs Storybook ${addonVersion} or later, project has ${version}`, fix: "Run: storysync init" });
    } else {
      add({ id: "addon-mcp", label: "@storybook/addon-mcp", status: "ok", detail: addonVersion ? `found ${addonVersion}` : "in package.json, not installed yet" });
    }
    add(hasAddonMcpInConfig(sbConfig.content)
      ? { id: "addon-registered", label: "addon-mcp registered", status: "ok", detail: "in .storybook/main's addons" }
      : { id: "addon-registered", label: "addon-mcp registered", status: "fail", detail: "not in .storybook/main's addons", fix: "Run: storysync init" });

    if (profile?.requiredFeatures.length) {
      const missing = missingFeatures(profile, enabledFeatures(sbConfig.content));
      add(missing.length
        ? { id: "features", label: "Framework flags", status: "fail", detail: `${missing.join(", ")} off: ${missing.map((f) => profile.featureReasons[f]).join("; ")}`, fix: "Run: storysync init" }
        : { id: "features", label: "Framework flags", status: "ok", detail: profile.requiredFeatures.join(", ") });
    }
    for (const issue of profile?.knownIssues ?? []) {
      add({ id: `known-${issue.id}`, label: `Known limit (${profile!.label})`, status: "info", detail: issue.message });
    }
  }

  // --- The running Storybook ---
  const from = storybookUrl.from === "default" ? "default" : storybookUrl.from === "env" ? ENV.storybookUrl : storybookUrl.from === "config" ? CONFIG_FILE : "--storybook";
  let reachable = false;
  try {
    const res = await deps.fetch(new URL("/index.json", storybookUrl.value), { signal: AbortSignal.timeout(5000) });
    const body = res.ok ? ((await res.json()) as { entries?: Record<string, unknown> }) : null;
    if (body?.entries) {
      reachable = true;
      add({ id: "storybook-running", label: "Storybook running", status: "ok", detail: `${storybookUrl.value} (${from}), ${Object.keys(body.entries).length} stories` });
    } else {
      add({ id: "storybook-running", label: "Storybook running", status: "fail", detail: `${storybookUrl.value} (${from}) answered, but isn't a Storybook (HTTP ${res.status})`, fix: "Check the URL: --storybook, or storybook.url in " + CONFIG_FILE });
    }
  } catch {
    add({ id: "storybook-running", label: "Storybook running", status: "fail", detail: `nothing at ${storybookUrl.value} (${from})`, fix: "Start it (npm run storybook), or point Storysync at it: --storybook, or storybook.url in " + CONFIG_FILE });
  }

  if (!reachable) {
    add({ id: "mcp", label: "Storybook MCP docs tools", status: "skip", detail: "Storybook isn't reachable" });
  } else {
    try {
      const { tools, components } = await deps.inspectMcp(storybookUrl.value);
      if (resolveDocsTools(tools)) {
        add({ id: "mcp", label: "Storybook MCP docs tools", status: "ok", detail: components == null ? "present" : `present, ${components} components` });
      } else {
        add({ id: "mcp", label: "Storybook MCP docs tools", status: "fail", detail: "MCP answers, but has no docs tools", fix: diagnoseMissingDocsTools(project).join(" ") });
      }
    } catch (err) {
      add({ id: "mcp", label: "Storybook MCP docs tools", status: "fail", detail: `no MCP at ${new URL("/mcp", storybookUrl.value)}: ${err instanceof Error ? err.message : String(err)}`, fix: "Run: storysync init, then restart Storybook" });
    }
  }

  // --- Browser for snap ---
  try {
    add({ id: "browser", label: "Browser for snap", status: "ok", detail: await deps.launchBrowser() });
  } catch (err) {
    add({ id: "browser", label: "Browser for snap", status: "fail", detail: err instanceof Error ? err.message.split("\n")[0] : String(err), fix: "Install Chrome or Edge, or run the install command snap prints" });
  }

  // --- Tokens ---
  const source = detectTokenSource(project);
  if (!source && !config.tokens?.source) {
    // A project without tokens isn't broken: components still sync.
    add({ id: "tokens", label: "Design tokens", status: "info", detail: `none found; components still sync. If you have tokens, set tokens.source in ${CONFIG_FILE}` });
  } else {
    const result = extractTokens(project, config.tokens?.source);
    const count = result.collections.reduce((n, c) => n + c.tokens.length, 0);
    const where = config.tokens?.source ? `${config.tokens.source} (from ${CONFIG_FILE})` : `${source!.type} (${relative(project, source!.path)})`;
    add(count
      ? { id: "tokens", label: "Design tokens", status: "ok", detail: `${count} from ${where}` }
      : { id: "tokens", label: "Design tokens", status: "warn", detail: `none found in ${where}`, fix: "Try another --source, or set tokens.source in " + CONFIG_FILE });
  }

  // --- Claude Code, for pushing to Figma and the coming UI ---
  const claude = await deps.claudeVersion();
  add(claude
    ? { id: "claude-code", label: "Claude Code", status: "ok", detail: claude }
    : { id: "claude-code", label: "Claude Code", status: "warn", detail: "not found", fix: "Needed to push to Figma: install Claude Code and log in" });
  add({ id: "figma", label: "Figma connection", status: "info", detail: "checked when you push: needs the Figma connector or plugin in Claude Code" });

  const summary: Record<CheckStatus, number> = { ok: 0, warn: 0, fail: 0, info: 0, skip: 0 };
  for (const c of checks) summary[c.status]++;
  return { project, storybookUrl, checks, summary, ok: summary.fail === 0 };
}

const MARKS: Record<CheckStatus, string> = {
  ok: chalk.green("✔"), warn: chalk.yellow("⚠"), fail: chalk.red("✖"), info: chalk.blue("ℹ"), skip: chalk.dim("–"),
};

/** The result as text, for the CLI and the wizard. */
export function formatDoctor(result: DoctorResult): string {
  const lines = [chalk.bold("\nstorysync doctor") + chalk.dim(`  ${result.project}\n`)];
  for (const c of result.checks) {
    lines.push(`${MARKS[c.status]} ${c.label.padEnd(26)} ${c.status === "ok" ? c.detail : chalk.dim(c.detail)}`);
    if (c.fix && (c.status === "fail" || c.status === "warn")) lines.push(chalk.dim(`  ${" ".repeat(27)}→ ${c.fix}`));
  }
  const s = result.summary;
  lines.push(`\n${result.ok ? chalk.green("Ready.") : chalk.red(`${s.fail} problem${s.fail === 1 ? "" : "s"} to fix.`)} ${chalk.dim(`${s.ok} ok, ${s.warn} warning${s.warn === 1 ? "" : "s"}, ${s.fail} failed`)}`);
  return lines.join("\n");
}

/** The real outside world doctor checks, behind DoctorDeps so tests can stand in for it. */
export const defaultDoctorDeps: DoctorDeps = {
  fetch,
  async inspectMcp(url) {
    const client = new StorybookClient(url);
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("no answer within 15s")), 15_000); });
    try {
      await Promise.race([client.connect(), deadline]);
      const tools = await client.listAvailableTools();
      const components = resolveDocsTools(tools) ? (await client.listComponents()).length : null;
      return { tools, components };
    } finally {
      clearTimeout(timer);
      await client.disconnect().catch(() => {});
    }
  },
  async launchBrowser() {
    const { browser, via } = await resolveAndLaunch();
    await browser.close();
    return via;
  },
  async claudeVersion() {
    // Through a shell, so a claude.cmd shim on Windows is found as well as claude.exe.
    const r = spawnSync("claude --version", { shell: true, encoding: "utf8", timeout: 15_000 });
    return r.status === 0 ? r.stdout.trim().split("\n")[0] || null : null;
  },
  nodeVersion: process.version,
  env: process.env,
};
