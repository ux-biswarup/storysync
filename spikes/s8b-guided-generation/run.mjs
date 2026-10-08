// Spike S8b: S8 again, with the procedure S8's findings call for.
//
// Same design, same library, fresh worktree. Changes from S8
// (docs/research/2026-10-07-s8-component-generation.md):
// - R3/R4: a mandatory reuse check, and named decisions that must go to the designer
// - R2:    read sizing mode and line height from the design; ask when intent is open
// - R7:    the task ends with the typed `storysync_submit_result` tool
// - R6:    policy by place (localhost and Claude Code's temp folder allowed, `cd`
//          outside the worktree denied); the session's processes are stopped at the end
//
// The scripted designer answers questions with fixed rules (see `answerFor`) and
// we log which option Claude recommended.
//
// Usage: node spikes/s8b-guided-generation/run.mjs
// Env:   SPIKE_REPO, SPIKE_FIGMA_URL (required); SPIKE_COMPONENT, SPIKE_MODEL

import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const REPO = process.env.SPIKE_REPO;
const FIGMA_URL = process.env.SPIKE_FIGMA_URL;
const COMPONENT = process.env.SPIKE_COMPONENT ?? "MetricTile";
const MODEL = process.env.SPIKE_MODEL ?? "sonnet";
if (!REPO || !FIGMA_URL) throw new Error("Set SPIKE_REPO and SPIKE_FIGMA_URL.");
const norm = (p) => path.resolve(p).toLowerCase().replace(/\\/g, "/");
const repoAbs = norm(REPO);

const started = Date.now();
const t = () => `+${((Date.now() - started) / 1000).toFixed(0)}s`;
const log = (kind, summary) => console.log(`${t().padStart(6)}  ${kind.padEnd(11)} ${summary}`);

// --- The scripted designer ---------------------------------------------------------
// Reuse: "new" so this run also tests generation and fidelity (a real designer would
// likely follow Claude's recommendation; we log it). Sizing: keep the design's sizes.
// Token gaps: keep the exact design value. Anything else: Claude's recommendation.
function answerFor(q) {
  const opts = q.options ?? [];
  const label = (re) => opts.find((o) => re.test(`${o.label} ${o.description ?? ""}`))?.label;
  const text = `${q.header ?? ""} ${q.question}`;
  if (/exist|reuse|already|extend|duplicate/i.test(text)) return label(/\bnew\b|separate|anyway/i) ?? opts.at(-1)?.label;
  if (/width|size|fixed|fill|hug|container/i.test(text)) return label(/fixed|as designed|exact|figma|240/i) ?? opts[0]?.label;
  if (/token|value|28|6 ?px/i.test(text)) return label(/exact|as designed|keep|new token|arbitrary/i) ?? opts[0]?.label;
  return opts[0]?.label ?? "Use your recommendation.";
}
const recommendedOf = (q) => (q.options ?? []).find((o) => /recommend/i.test(o.label + (o.description ?? "")))?.label ?? q.options?.[0]?.label;

// --- Policy by place ----------------------------------------------------------------
const TEMP_OK = /\/temp\/claude\/|\/\.claude\//;
const BLOCKED_BASH = /\bgit\s+(commit|push|checkout|switch|branch|reset|worktree|stash)\b|\bnpm\s+(publish|i|install|ci|uninstall)\b|\brm\s+-rf\b/i;
function decide(tool, input) {
  if (tool === "AskUserQuestion") {
    const answers = {};
    const asked = [];
    for (const q of input.questions ?? []) {
      answers[q.question] = answerFor(q);
      asked.push({ question: q.question, options: (q.options ?? []).map((o) => o.label), recommended: recommendedOf(q), answered: answers[q.question] });
    }
    questions.push(...asked);
    return { allow: true, updatedInput: { ...input, answers }, note: asked.map((a) => `Q: ${a.question.slice(0, 70)} → ${a.answered} (rec: ${a.recommended})`).join(" | ") };
  }
  if (tool === "Bash") {
    const cmd = input.command ?? "";
    if (BLOCKED_BASH.test(cmd)) return { allow: false, message: "Storysync blocked this command: it changes git state or installs packages." };
    const curls = [...cmd.matchAll(/\bcurl\b[^|;&]*?(https?:\/\/[^\s"']+)/g)].map((m) => m[1]);
    if (curls.some((u) => !/^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(u))) return { allow: false, message: "Storysync blocked a network request outside this computer." };
    for (const m of cmd.matchAll(/\bcd\s+("([^"]+)"|'([^']+)'|(\S+))/g)) {
      const dir = norm(m[2] ?? m[3] ?? m[4]);
      if (!dir.startsWith(repoAbs) && !TEMP_OK.test(dir + "/")) return { allow: false, message: `Storysync blocked working in ${dir}: only the component library's folder is allowed.` };
    }
    return { allow: true };
  }
  const file = input.file_path ?? input.notebook_path;
  if (file) {
    const f = norm(file);
    const inRepo = f.startsWith(repoAbs);
    if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool) && !inRepo) return { allow: false, message: `Storysync blocked changing ${file}: only files inside the component library may change.` };
    if (!inRepo && !TEMP_OK.test(f)) return { allow: false, message: `Storysync blocked reading ${file}: outside the component library.` };
  }
  return { allow: true };
}

const approvals = [];
const questions = [];
let submitted = null;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const data = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    if (req.url === "/result") {
      submitted = data;
      log("RESULT", `outcome=${data.outcome} files=${(data.files ?? []).length} decisions=${(data.decisions ?? []).length}`);
      return res.end("{}");
    }
    const { tool_name, input } = data;
    const d = decide(tool_name, input);
    approvals.push({ at: t(), tool: tool_name, allow: d.allow, detail: String(input.command ?? input.file_path ?? "").slice(0, 200) });
    log(d.allow ? "allow" : "DENY", `${tool_name} ${input.command ?? input.file_path ?? ""} ${d.note ?? d.message ?? ""}`.slice(0, 220));
    res.end(JSON.stringify(d));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const mcpConfigPath = path.join(resultsDir, "mcp-config.json");
fs.writeFileSync(mcpConfigPath, JSON.stringify({
  mcpServers: {
    storysync: {
      type: "stdio",
      command: process.execPath,
      args: [path.join(here, "..", "s5-headless-claude-code", "storysync-mcp.mjs")],
      env: { SPIKE_APPROVAL_URL: `http://127.0.0.1:${server.address().port}/approve` },
    },
  },
}, null, 2));

const ROLE = `You are the assistant inside Storysync, a local app that turns designers' Figma components into code in their team's component library. The person you're helping is a designer: they can't write or review code, and their messages come from Storysync's UI. Your output will be reviewed by the library's engineers in a pull request, so it must be indistinguishable from the code they'd write themselves.

This repository has its own instructions (CLAUDE.md, AGENTS.md, README.md, and skills such as figma-styling). Follow them. There is no Jira ticket, so skip the ticket phases and their files, but apply the same coding standards, Storybook requirements and completion checklist. Don't commit, push, create branches or install packages; Storysync handles git.

Required procedure, in this order:
1. Read the design with the Figma MCP tools. For every frame and text layer, note its sizing (fixed, hug or fill, and the size), and every text layer's line height.
2. Reuse check, before writing any code. Search this library for components that already serve the same purpose: read the components' props and docs, not only ones that look alike. If any existing component covers all or part of this design, you MUST ask the designer with AskUserQuestion. Offer: use the existing component as is; extend it with what's missing; or create a new component anyway. Put your recommendation first, mark it "(Recommended)", and explain the trade-off in plain words.
3. Design decisions. Ask the designer (AskUserQuestion; several questions in one call is fine) about anything the design leaves open, at least: whether fixed sizes in the design should stay fixed or fill their container; and each design value with no exact token (keep the exact value, or use the nearest token, which you name).
4. Implement, following the designer's answers and this repo's conventions. Match the design's sizes and line heights.
5. Run npm run typecheck, and the tests for the new or changed stories only (not the whole suite). Fix what fails.
6. Stop every process you started, such as a Storybook. Then call the storysync_submit_result tool exactly once, as your last action.`;

const request = `I've designed a new component in Figma called ${COMPONENT}: ${FIGMA_URL}

Please add it to our component library as a proper, reusable component, with all its variants in Storybook. Use our existing tokens.`;
const NUDGE = "Please carry on with the procedure until it's finished, and end by calling storysync_submit_result.";
fs.writeFileSync(path.join(resultsDir, "prompt.txt"), `ROLE:\n${ROLE}\n\nREQUEST:\n${request}`);

const args = [
  "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
  "--model", MODEL, "--append-system-prompt", ROLE, "--mcp-config", mcpConfigPath,
  "--permission-prompt-tool", "mcp__storysync__approve", "--max-turns", "120",
];
log("start", `claude in ${REPO} (model ${MODEL})`);
const child = spawn("claude", args, { cwd: REPO, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const send = (text) => {
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n");
  log("user", text.slice(0, 100));
};

const transcript = fs.createWriteStream(path.join(resultsDir, "stream.jsonl"));
let stderr = "";
child.stderr.on("data", (c) => (stderr += c));
let buffer = "";
const results = [];
const toolCounts = {};
let nudges = 0;
send(request);

child.stdout.on("data", (chunk) => {
  transcript.write(chunk);
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.type === "assistant") {
      for (const part of msg.message.content) {
        if (part.type === "tool_use") {
          toolCounts[part.name] = (toolCounts[part.name] ?? 0) + 1;
          const d = part.input?.command ?? part.input?.file_path ?? part.input?.skill ?? part.input?.pattern ?? "";
          log("tool", `${part.name} ${String(d).slice(0, 110)}`);
        }
        if (part.type === "text" && part.text.trim()) log("claude", part.text.trim().replace(/\s+/g, " ").slice(0, 160));
      }
    } else if (msg.type === "result") {
      results.push({ subtype: msg.subtype, costUsd: msg.total_cost_usd, turns: msg.num_turns, durationMs: msg.duration_ms, text: msg.result });
      log("turn_done", `${msg.subtype}, turns=${msg.num_turns}, cost so far $${msg.total_cost_usd?.toFixed(2)}`);
      if (!submitted && nudges < 1 && msg.subtype === "success") { nudges++; send(NUDGE); }
      else child.stdin.end();
    }
  }
});

const exitCode = await new Promise((r) => child.on("close", r));
server.close();
transcript.end();

// Stop every process still running from the worktree (R6).
let stopped = [];
try {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(REPO)}*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`;
  stopped = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
} catch {}
log("cleanup", `stopped ${stopped.length} leftover process(es) from the worktree`);

const summary = { model: MODEL, exitCode, durationMs: Date.now() - started, results, nudges, submitted, questions, toolCounts, approvals, leftoverProcessesStopped: stopped.length, stderr: stderr.slice(0, 2000) };
fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
log("end", `exit ${exitCode}; submitted=${!!submitted}; summary in results/summary.json`);
