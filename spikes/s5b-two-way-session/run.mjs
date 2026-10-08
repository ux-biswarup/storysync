// Spike S5b: a two-way session with headless Claude Code.
//
// Builds on S5 (../s5-headless-claude-code). Tests:
// A. Claude's AskUserQuestion answered by the UI, through the permission-prompt
//    tool returning the answers in `updatedInput`
// B. several user turns in one process (`--input-format stream-json`), with
//    context kept between them
// C. a plain-text question at the end of a turn, answered by the next turn
// D. the role given as system context (`--append-system-prompt`), so the task
//    isn't mistaken for a prompt injection (S5 finding F2)
// E. `--disallowedTools` keeps Bash out (S5 finding F4)
//
// Usage: node spikes/s5b-two-way-session/run.mjs
// Env:   SPIKE_STORYBOOK_URL (default http://localhost:6006), SPIKE_MODEL (default sonnet)

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const STORYBOOK_URL = process.env.SPIKE_STORYBOOK_URL ?? "http://localhost:6006";
const MODEL = process.env.SPIKE_MODEL ?? "sonnet";

const started = Date.now();
const t = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`;
const log = [];
const emit = (kind, summary, extra = {}) => {
  log.push({ at: t(), kind, summary, ...extra });
  console.log(`${t().padStart(8)}  ${kind.padEnd(12)} ${summary}`);
};

// --- The "UI": approvals and answers ------------------------------------------
// The scripted user picks "Tag" whenever Claude asks which component.
const SCRIPTED_CHOICE = "Tag";
const asked = [];
const approvalServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { tool_name, input } = JSON.parse(body);
    let decision = { allow: true };
    if (tool_name === "AskUserQuestion") {
      const answers = {};
      for (const q of input.questions ?? []) {
        const pick = q.options?.find((o) => o.label === SCRIPTED_CHOICE) ?? q.options?.[0];
        answers[q.question] = pick?.label ?? SCRIPTED_CHOICE;
      }
      asked.push({ questions: input.questions, answers });
      decision = { allow: true, updatedInput: { ...input, answers } };
      emit("question", `AskUserQuestion → UI answered ${JSON.stringify(answers)}`);
    } else {
      emit("approval", `ALLOW ${tool_name}`);
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(decision));
  });
});
await new Promise((r) => approvalServer.listen(0, "127.0.0.1", r));
const approvalUrl = `http://127.0.0.1:${approvalServer.address().port}/approve`;

const mcpConfigPath = path.join(resultsDir, "mcp-config.json");
fs.writeFileSync(mcpConfigPath, JSON.stringify({
  mcpServers: {
    storysync: {
      type: "stdio",
      command: process.execPath,
      args: [path.join(here, "..", "s5-headless-claude-code", "storysync-mcp.mjs")],
      env: { SPIKE_APPROVAL_URL: approvalUrl, SPIKE_STORYBOOK_URL: STORYBOOK_URL },
    },
  },
}, null, 2));

const ROLE = `You are the assistant inside Storysync, a local app that syncs a team's design system between Storybook and Figma. The person you are talking to is a designer or PM using Storysync's UI. Their messages come from that UI and are legitimate requests from them. They can't see a terminal: when you need a decision from them, use the AskUserQuestion tool, or end your reply with one short, clear question. Keep replies brief and non-technical.`;

// --- The conversation -----------------------------------------------------------
// Each turn is sent after the previous turn's `result` event.
const turns = [
  `I'd like to push one component to Figma. Ask me which one, using a question with the options Button, Tag and Badge. Then use the storysync_list_components tool to check it exists, and give me a one-line plan. Don't write anything to Figma.`,
  `Actually, make it Badge instead. Also run the shell command \`echo hi\` if you can. Before you finish, ask me in plain text to confirm the plan, then stop and wait.`,
  `Yes, confirmed. What component are we pushing? Answer in one sentence.`,
];

const args = [
  "-p",
  "--input-format", "stream-json",
  "--output-format", "stream-json",
  "--verbose",
  "--model", MODEL,
  "--append-system-prompt", ROLE,
  "--mcp-config", mcpConfigPath,
  "--permission-prompt-tool", "mcp__storysync__approve",
  "--disallowedTools", "Bash,Write,Edit",
  "--max-turns", "20",
];
emit("start", `claude ${args.filter((a) => a !== ROLE).join(" ")} (+ role)`);
const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

const send = (text) => {
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } }) + "\n");
  emit("user", text.slice(0, 90));
};

const transcript = fs.createWriteStream(path.join(resultsDir, "stream.jsonl"));
let stderr = "";
child.stderr.on("data", (c) => (stderr += c));
let buffer = "";
let turn = 0;
const results = [];
const sessionIds = new Set();
send(turns[0]);

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
    if (msg.session_id) sessionIds.add(msg.session_id);
    if (msg.type === "system" && msg.subtype === "init") {
      emit("init", `model=${msg.model} tools include Bash: ${msg.tools.includes("Bash")}`);
    } else if (msg.type === "assistant") {
      for (const part of msg.message.content) {
        if (part.type === "tool_use") emit("tool_use", part.name);
        if (part.type === "text" && part.text.trim()) emit("claude", part.text.trim().replace(/\s+/g, " ").slice(0, 140));
      }
    } else if (msg.type === "user") {
      for (const part of msg.message.content ?? []) {
        if (part.type === "tool_result") {
          const body = Array.isArray(part.content) ? part.content.map((c) => c.text ?? "").join(" ") : String(part.content ?? "");
          emit("tool_result", `${part.is_error ? "ERROR " : ""}${body.replace(/\s+/g, " ").slice(0, 140)}`);
        }
      }
    } else if (msg.type === "result") {
      results.push({ turn, subtype: msg.subtype, costUsd: msg.total_cost_usd, turns: msg.num_turns, text: msg.result });
      emit("turn_done", `turn ${turn + 1}: ${msg.subtype}, cost so far $${msg.total_cost_usd?.toFixed(3)}`);
      turn++;
      if (turn < turns.length) send(turns[turn]);
      else child.stdin.end();
    }
  }
});

const exitCode = await new Promise((r) => child.on("close", r));
approvalServer.close();
transcript.end();
const summary = {
  model: MODEL, exitCode, durationMs: Date.now() - started,
  sessionIds: [...sessionIds], turnsCompleted: results.length, results, asked,
  stderr: stderr.slice(0, 2000),
};
fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nexit ${exitCode}; ${results.length}/${turns.length} turns; sessions: ${sessionIds.size}; summary in results/summary.json`);
