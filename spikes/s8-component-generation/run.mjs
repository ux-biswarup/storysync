// Spike S8: can headless Claude Code turn a designer's Figma component into a
// proper, reusable component in a real library, following that library's own
// conventions, with nobody writing code?
//
// Runs Claude Code in an isolated worktree of the target library, as the
// Storysync UI would (S5/S5b design): role as system context, one session,
// approvals and questions answered by a scripted "UI" that never writes code.
//
// Usage: node spikes/s8-component-generation/run.mjs
// Env:   SPIKE_REPO (worktree path, required), SPIKE_FIGMA_URL (required),
//        SPIKE_COMPONENT (default MetricTile), SPIKE_MODEL (default sonnet)

import { spawn } from "node:child_process";
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
const repoAbs = path.resolve(REPO).toLowerCase();

const started = Date.now();
const t = () => `+${((Date.now() - started) / 1000).toFixed(0)}s`;
const log = (kind, summary) => console.log(`${t().padStart(6)}  ${kind.padEnd(11)} ${summary}`);

// --- The scripted "UI" -----------------------------------------------------------
// Allows the agent's work inside the worktree; blocks anything that leaves it or
// publishes. Answers structured questions with the first (recommended) option.
const approvals = [];
const questions = [];
const BLOCKED_BASH = /\bgit\s+(commit|push|checkout|switch|branch|reset|worktree)\b|\bnpm\s+(publish|i|install|ci|uninstall)\b|\brm\s+-rf\b|\bcurl\b/i;
function decide(tool, input) {
  if (tool === "AskUserQuestion") {
    const answers = {};
    for (const q of input.questions ?? []) answers[q.question] = q.options?.[0]?.label ?? "Use your best judgement.";
    questions.push({ questions: input.questions, answers });
    return { allow: true, updatedInput: { ...input, answers }, note: `answered ${JSON.stringify(answers)}` };
  }
  if (tool === "Bash" && BLOCKED_BASH.test(input.command ?? "")) {
    return { allow: false, message: `Storysync blocked this command: it changes git state, installs packages or reaches the network. You can't do that in this task.` };
  }
  const file = input.file_path ?? input.notebook_path;
  if (file && !path.resolve(file).toLowerCase().startsWith(repoAbs)) {
    return { allow: false, message: `Storysync blocked editing ${file}: only files inside the component library may change.` };
  }
  return { allow: true };
}
const approvalServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { tool_name, input } = JSON.parse(body);
    const d = decide(tool_name, input);
    approvals.push({ at: t(), tool: tool_name, allow: d.allow, detail: input.command ?? input.file_path ?? "" });
    log(d.allow ? "allow" : "DENY", `${tool_name} ${input.command ?? input.file_path ?? ""} ${d.note ?? d.message ?? ""}`.slice(0, 150));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(d));
  });
});
await new Promise((r) => approvalServer.listen(0, "127.0.0.1", r));

const mcpConfigPath = path.join(resultsDir, "mcp-config.json");
fs.writeFileSync(mcpConfigPath, JSON.stringify({
  mcpServers: {
    storysync: {
      type: "stdio",
      command: process.execPath,
      args: [path.join(here, "..", "s5-headless-claude-code", "storysync-mcp.mjs")],
      env: { SPIKE_APPROVAL_URL: `http://127.0.0.1:${approvalServer.address().port}/approve` },
    },
  },
}, null, 2));

const ROLE = `You are the assistant inside Storysync, a local app that turns designers' Figma components into code in their team's component library. The person you're helping is a designer: they can't write or review code, and their messages come from Storysync's UI. Your output will be reviewed by the library's engineers in a pull request, so it must be indistinguishable from the code they'd write themselves.

How to work:
- This repository has its own instructions (CLAUDE.md, AGENTS.md, README.md, and skills such as figma-styling). Follow them. There is no Jira ticket for this request, so skip the ticket phases and their files, but apply the same coding standards, Storybook requirements and completion checklist.
- Read the design through the Figma MCP tools available to you.
- Resolve every value in the design to the library's existing tokens. Don't hard-code colours, spacing or radii that a token covers.
- Don't commit, push, create branches, or install packages. Storysync handles git.
- Run the type check (npm run typecheck) and fix what it reports before you finish.
- If you need a decision from the designer, ask with AskUserQuestion, recommended option first.`;

const request = `I've designed a new component in Figma called ${COMPONENT}: ${FIGMA_URL}

Please add it to our component library as a proper, reusable component, with all its variants in Storybook. Use our existing tokens. When you're done, tell me in plain words what you made, then end your reply with one JSON line with these keys: files (list), props (list), variants (list), tokensUsed (list), hardcodedValues (list, with why), checks (typecheck result), openQuestions (list).`;
const FOLLOW_UP = "Use your best judgement, following the library's conventions, and carry on until it's finished.";
fs.writeFileSync(path.join(resultsDir, "prompt.txt"), `ROLE:\n${ROLE}\n\nREQUEST:\n${request}`);

const args = [
  "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
  "--model", MODEL,
  "--append-system-prompt", ROLE,
  "--mcp-config", mcpConfigPath,
  "--permission-prompt-tool", "mcp__storysync__approve",
  "--max-turns", "120",
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
let followUps = 0;
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
        if (part.type === "text" && part.text.trim()) log("claude", part.text.trim().replace(/\s+/g, " ").slice(0, 150));
      }
    } else if (msg.type === "result") {
      results.push({ subtype: msg.subtype, costUsd: msg.total_cost_usd, turns: msg.num_turns, durationMs: msg.duration_ms, text: msg.result });
      log("turn_done", `${msg.subtype}, turns=${msg.num_turns}, cost so far $${msg.total_cost_usd?.toFixed(2)}`);
      const lastLine = (msg.result ?? "").trim().split("\n").pop();
      const finished = /^\s*\{.*"files"/.test(lastLine);
      if (!finished && followUps < 2 && msg.subtype === "success") { followUps++; send(FOLLOW_UP); }
      else child.stdin.end();
    }
  }
});

const exitCode = await new Promise((r) => child.on("close", r));
approvalServer.close();
transcript.end();
const summary = { model: MODEL, exitCode, durationMs: Date.now() - started, results, followUps, toolCounts, approvals, questions, stderr: stderr.slice(0, 2000) };
fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
log("end", `exit ${exitCode}; ${results.length} turn(s); summary in results/summary.json`);
