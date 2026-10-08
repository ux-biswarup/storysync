// `storysync setup` — drops the skill file, slash commands, and MCP config hints into a project.

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import chalk from "chalk";

export type Client = "claude" | "cursor" | "codex";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findPackageRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "skills"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const PACKAGE_ROOT = findPackageRoot(__dirname);

function copyIfMissing(src: string, dest: string, force: boolean): "wrote" | "skipped" | "exists" {
  if (existsSync(dest) && !force) return "exists";
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return "wrote";
}

interface SetupResult {
  written: string[];
  skipped: string[];
  notes: string[];
}

/**
 * Claude Code loads a skill from `skills/<name>/SKILL.md`, not a flat
 * `skills/<name>.md`, and requires YAML frontmatter with a name and
 * description. Written as a bare file the skill is silently never loaded —
 * `setup` reports success, the slash commands still work because commands do
 * accept flat files, and the plain-English trigger does nothing at all.
 */
const CLAUDE_SKILL_FRONTMATTER = [
  "---",
  "name: storysync",
  "description: Sync Storybook components and design tokens from code to Figma, measuring each variant's rendered styles rather than inferring them. Use when pushing a component library to Figma, scoring what landed against what rendered, or auditing drift between code and a Figma file.",
  "---",
  "",
].join("\n");

function setupClaude(projectPath: string, force: boolean): SetupResult {
  const skillsSrc = join(PACKAGE_ROOT, "skills", "claude-code.md");
  const skillsDest = join(projectPath, ".claude", "skills", "storysync", "SKILL.md");
  const legacySkillPath = join(projectPath, ".claude", "skills", "storysync.md");
  const commandsSrcDir = join(PACKAGE_ROOT, "commands");
  const commandsDestDir = join(projectPath, ".claude", "commands");

  const written: string[] = [];
  const skipped: string[] = [];
  const extraNotes: string[] = [];

  if (existsSync(skillsDest) && !force) {
    skipped.push(relative(projectPath, skillsDest));
  } else {
    const body = readFileSync(skillsSrc, "utf8");
    mkdirSync(dirname(skillsDest), { recursive: true });
    writeFileSync(skillsDest, body.startsWith("---") ? body : CLAUDE_SKILL_FRONTMATTER + body);
    written.push(relative(projectPath, skillsDest));
  }



  if (existsSync(commandsSrcDir)) {
    for (const file of readdirSync(commandsSrcDir)) {
      if (!file.endsWith(".md")) continue;
      const src = join(commandsSrcDir, file);
      const dest = join(commandsDestDir, file);
      if (copyIfMissing(src, dest, force) === "wrote") written.push(relative(projectPath, dest));
      else skipped.push(relative(projectPath, dest));
    }
  }

  // Commands kept from an earlier setup still send the agent to the old flat
  // skill path. Without --force they are skipped, so say so — otherwise the
  // skill is updated but the command that points at it is not.
  // Only a file can be one: a storysync/ folder is a namespace of the
  // project's own commands, and a link may lead nowhere.
  const staleCommands = existsSync(commandsDestDir)
    ? readdirSync(commandsDestDir).filter((file) => {
        if (!file.startsWith("storysync") || !file.endsWith(".md")) return false;
        try {
          return readFileSync(join(commandsDestDir, file), "utf8").includes(".claude/skills/storysync.md");
        } catch {
          return false;
        }
      })
    : [];
  if (staleCommands.length) {
    extraNotes.push(
      `${staleCommands.join(", ")} still point at .claude/skills/storysync.md. Re-run with --force to update them.`,
    );
  }
  // Earlier versions wrote the flat path, which never loaded. Only suggest
  // removing it once nothing points at it any more.
  if (existsSync(legacySkillPath)) {
    extraNotes.push(
      staleCommands.length
        ? `Then remove ${relative(projectPath, legacySkillPath)} — it predates the skill directory layout and is never loaded.`
        : `Remove ${relative(projectPath, legacySkillPath)} — it predates the skill directory layout and is never loaded.`,
    );
  }

  return {
    written,
    skipped,
    notes: [
      ...extraNotes,
      "Add Storybook MCP:  claude mcp add --transport http storybook http://localhost:6006/mcp",
      "Add Figma plugin:    claude plugin install figma@claude-plugins-official",
      "Then in Claude Code: /storysync-push <figma-file-key>",
    ],
  };
}

/**
 * Cursor reads project rules only as `.mdc` files under `.cursor/rules`; a
 * plain `.md` there is ignored. The rule's frontmatter has a description and
 * `alwaysApply: false` with no globs, which makes it "Apply Intelligently":
 * the agent pulls it in when a request matches the description.
 */
function setupCursor(projectPath: string, force: boolean): SetupResult {
  const ruleSrc = join(PACKAGE_ROOT, "skills", "cursor.mdc");
  const ruleDest = join(projectPath, ".cursor", "rules", "storysync.mdc");

  const written: string[] = [];
  const skipped: string[] = [];
  const extraNotes: string[] = [];

  if (copyIfMissing(ruleSrc, ruleDest, force) === "wrote") written.push(relative(projectPath, ruleDest));
  else skipped.push(relative(projectPath, ruleDest));

  // Cursor also loads skills from .agents/skills and .claude/skills, so a copy
  // setup wrote for Codex or Claude Code reaches Cursor's agent too, with that
  // editor's setup instructions. Say so rather than removing it: the other
  // editor may still use it.
  for (const [dir, editor] of [[".agents", "Codex"], [".claude", "Claude Code"]] as const) {
    const skill = join(projectPath, dir, "skills", "storysync");
    if (existsSync(skill)) {
      extraNotes.push(`Cursor also loads ${relative(projectPath, skill)}, the ${editor} copy of this skill; its setup lines are for ${editor}, not Cursor.`);
    }
  }

  return {
    written,
    skipped,
    notes: [
      ...extraNotes,
      "Add Storybook MCP to .cursor/mcp.json:",
      "  { \"mcpServers\": { \"storybook\": { \"url\": \"http://localhost:6006/mcp\" } } }",
      "Add Figma: in Cursor's Agent chat, run /add-plugin figma and sign in when prompted",
      "Then in Agent chat say: \"Push my Storybook to Figma (file key: <key>)\"",
    ],
  };
}

/** How the copy an earlier setup wrote into AGENTS.md begins. */
const LEGACY_CODEX_HEADING = "# storysync — Storybook to Figma";

/**
 * Codex loads a skill from `.agents/skills/<name>/SKILL.md`, which carries its
 * own frontmatter. Earlier versions wrote the procedure to AGENTS.md instead,
 * which is the project's own instructions file: most projects that use Codex
 * already have one, so setup skipped it and the procedure never arrived, and
 * --force replaced the project's instructions with storysync's.
 */
function setupCodex(projectPath: string, force: boolean): SetupResult {
  const skillSrc = join(PACKAGE_ROOT, "skills", "codex.md");
  const skillDest = join(projectPath, ".agents", "skills", "storysync", "SKILL.md");
  const agentsPath = join(projectPath, "AGENTS.md");

  const written: string[] = [];
  const skipped: string[] = [];
  const extraNotes: string[] = [];

  if (copyIfMissing(skillSrc, skillDest, force) === "wrote") written.push(relative(projectPath, skillDest));
  else skipped.push(relative(projectPath, skillDest));

  // AGENTS.md is loaded into every Codex session, so an old copy keeps
  // competing with the skill. It may hold the project's own instructions too,
  // so say what to remove rather than touching it.
  if (existsSync(agentsPath) && readFileSync(agentsPath, "utf8").startsWith(LEGACY_CODEX_HEADING)) {
    extraNotes.push(
      `Remove the storysync instructions from ${relative(projectPath, agentsPath)} — an earlier setup wrote them there, and Codex now loads them from ${relative(projectPath, skillDest)}.`,
    );
  }

  return {
    written,
    skipped,
    notes: [
      ...extraNotes,
      "Add Storybook MCP:  codex mcp add storybook --url http://localhost:6006/mcp",
      "Add Figma MCP:      codex mcp add figma --url https://mcp.figma.com/mcp   (or the Figma plugin, from /plugins)",
      "Approve npx storysync when Codex asks to run it outside the sandbox: it needs Storybook on localhost and a browser",
      "Then say: \"Push my Storybook to Figma (file key: <key>)\" — or $storysync to name the skill",
    ],
  };
}

/** Runs a command, as registerMcp needs it; injected so tests don't touch the real clients. */
export type Exec = (command: string, args: string[], cwd: string) => { status: number | null; stdout: string };

/** The real Exec: through a shell, so Windows finds `.cmd` shims such as claude.cmd as well as `.exe`s. */
export const shellExec: Exec = (command, args, cwd) => {
  const quoted = [command, ...args].map((a) => (/^[\w@/:.=+-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)).join(" ");
  const r = spawnSync(quoted, { cwd, shell: true, encoding: "utf8", timeout: 90_000 });
  return { status: r.status, stdout: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

export interface RegisterResult {
  /** What was done, one line each, for the user. */
  done: string[];
  /** What the user still has to do, or should know. */
  notes: string[];
  ok: boolean;
  /**
   * The client already has a server named storybook that points elsewhere,
   * and `replace` wasn't given, so it was kept. The caller can ask the user,
   * then call again with `replace`.
   */
  conflict?: { current: string; wanted: string };
}

/**
 * Registers Storybook MCP with the client for this project (plan item 2.4),
 * instead of printing the command for the user to run:
 * - Claude Code: `claude mcp add` in the project (its default, local scope),
 *   and says whether a Figma connector or plugin is there. Claude Code keeps
 *   local servers per git repository, so a worktree shares its main
 *   checkout's: never replaced without `replace`.
 * - Cursor: merges the server into .cursor/mcp.json.
 * - Codex: adds it to the project's .codex/config.toml.
 * A server named storybook that points elsewhere is kept, and reported as a
 * conflict, unless `replace` is set.
 */
export function registerMcp(client: Client, projectInput: string, storybookUrl: string, exec: Exec = shellExec, replace = false): RegisterResult {
  const projectPath = resolve(projectInput);
  const mcpUrl = new URL("/mcp", storybookUrl).toString();
  const done: string[] = [];
  const notes: string[] = [];
  const conflict = (current: string, where: string): RegisterResult => ({
    done,
    notes: [`${where} already has a storybook server pointing at ${current}, so it was kept. To use ${mcpUrl} instead, run: storysync setup --client ${client} --register-mcp --replace-mcp --storybook ${storybookUrl}`],
    ok: true,
    conflict: { current, wanted: mcpUrl },
  });

  if (client === "claude") {
    const existing = exec("claude", ["mcp", "get", "storybook"], projectPath);
    // Not installed: the shell can't find it. (A missing server is "No MCP server found", exit 1.)
    if (existing.status === null || /is not recognized as an internal|command not found/i.test(existing.stdout)) {
      return { done, notes: ["Claude Code isn't installed or isn't on PATH. Install it, then run: storysync setup --client claude --register-mcp"], ok: false };
    }
    const current = existing.status === 0 ? /URL:\s*(\S+)/.exec(existing.stdout)?.[1] ?? "another URL" : null;
    if (current === mcpUrl) {
      done.push(`Storybook MCP already registered in Claude Code (${mcpUrl})`);
    } else {
      if (current && !replace) return conflict(current, "Claude Code");
      if (current) {
        exec("claude", ["mcp", "remove", "storybook"], projectPath);
        done.push(`Removed Claude Code's storybook server (${current}), as asked`);
      }
      const add = exec("claude", ["mcp", "add", "--transport", "http", "storybook", mcpUrl], projectPath);
      if (add.status !== 0) {
        return { done, notes: [`claude mcp add failed: ${add.stdout.trim().split("\n")[0]}`, `Run it yourself: claude mcp add --transport http storybook ${mcpUrl}`], ok: false };
      }
      done.push(`Registered Storybook MCP in Claude Code for this project (${mcpUrl})`);
    }
    // "No MCP server found" already lists every configured server; otherwise
    // ask for the list (slower: it checks each server's health).
    const servers = /Configured servers:/.test(existing.stdout) ? existing.stdout : exec("claude", ["mcp", "list"], projectPath).stdout;
    if (/figma/i.test(servers)) done.push("Figma is available in Claude Code");
    else notes.push("No Figma server in Claude Code. Add one: claude plugin install figma@claude-plugins-official");
    return { done, notes, ok: true };
  }

  if (client === "cursor") {
    const path = join(projectPath, ".cursor", "mcp.json");
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(path)) {
      try {
        config = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return { done, notes: [`${relative(projectPath, path)} isn't valid JSON, so it was left alone. Add: "storybook": { "url": "${mcpUrl}" }`], ok: false };
      }
    }
    const current = (config.mcpServers?.storybook as { url?: string } | undefined)?.url;
    if (current === mcpUrl) {
      done.push(`Storybook MCP already in ${relative(projectPath, path)}`);
    } else {
      if (current && !replace) return conflict(current, relative(projectPath, path));
      config.mcpServers = { ...(config.mcpServers ?? {}), storybook: { url: mcpUrl } };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
      done.push(`${current ? `Replaced ${current} with` : "Added"} Storybook MCP in ${relative(projectPath, path)} (${mcpUrl})`);
    }
    notes.push("Add Figma: in Cursor's Agent chat, run /add-plugin figma and sign in when prompted");
    return { done, notes, ok: true };
  }

  const path = join(projectPath, ".codex", "config.toml");
  const toml = existsSync(path) ? readFileSync(path, "utf8") : "";
  const block = /^\[mcp_servers\.storybook\]\s*\n(?:(?!\[)[^\n]*\n?)*/m.exec(toml);
  if (block && block[0].includes(`"${mcpUrl}"`)) {
    done.push(`Storybook MCP already in ${relative(projectPath, path)}`);
  } else {
    if (block && !replace) return conflict(/url\s*=\s*"([^"]+)"/.exec(block[0])?.[1] ?? "another URL", relative(projectPath, path));
    const entry = `[mcp_servers.storybook]\nurl = "${mcpUrl}"\n`;
    const next = block ? toml.replace(block[0], entry) : `${toml}${toml && !toml.endsWith("\n") ? "\n" : ""}${toml ? "\n" : ""}${entry}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
    done.push(`${block ? "Replaced" : "Added"} Storybook MCP in ${relative(projectPath, path)} (${mcpUrl}); Codex reads it once you trust the project`);
  }
  notes.push("Add Figma: codex mcp add figma --url https://mcp.figma.com/mcp (or the Figma plugin, from /plugins)");
  return { done, notes, ok: true };
}

export interface SetupOptions {
  /** Register Storybook MCP with the client instead of printing how. */
  registerMcp?: boolean;
  /** Replace a storybook server the client already has that points elsewhere. */
  replaceMcp?: boolean;
  /** The Storybook URL to register, already resolved by precedence. */
  storybookUrl?: string;
  exec?: Exec;
  /** Asked when the client already has a different storybook server; replaces it on yes. */
  confirmReplace?: (current: string, wanted: string) => Promise<boolean>;
}

export async function runSetup(client: Client, projectInput: string, force: boolean, options: SetupOptions = {}): Promise<void> {
  const projectPath = resolve(projectInput);

  console.log(chalk.bold(`\nstorysync setup — ${client}`));
  console.log(chalk.dim(`Project: ${projectPath}\n`));

  let result: SetupResult;
  if (client === "claude") result = setupClaude(projectPath, force);
  else if (client === "cursor") result = setupCursor(projectPath, force);
  else result = setupCodex(projectPath, force);

  for (const f of result.written) console.log(`  ${chalk.green("✔")} wrote ${f}`);
  for (const f of result.skipped) console.log(`  ${chalk.dim("•")} ${chalk.dim(f)} ${chalk.dim("(exists, use --force to overwrite)")}`);

  let notes = result.notes;
  if (options.registerMcp) {
    const url = options.storybookUrl ?? "http://localhost:6006";
    let reg = registerMcp(client, projectPath, url, options.exec, !!options.replaceMcp);
    // A different storybook server is never replaced silently: ask, when we can.
    if (reg.conflict && options.confirmReplace && await options.confirmReplace(reg.conflict.current, reg.conflict.wanted)) {
      reg = registerMcp(client, projectPath, url, options.exec, true);
    }
    for (const d of reg.done) console.log(`  ${chalk.green("✔")} ${d}`);
    if (!reg.ok) process.exitCode = 1;
    // The printed MCP commands are what registering just did; keep the rest.
    notes = [...reg.notes, ...notes.filter((n) => !/MCP|mcp\.json|mcpServers|mcp add|\/add-plugin|plugin install/.test(n))];
  }

  if (notes.length) {
    console.log(`\n${chalk.bold("Next steps:")}`);
    for (const n of notes) console.log(`  ${chalk.dim(n)}`);
  }

  console.log("");
}
