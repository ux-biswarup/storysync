// Spike S5: can a local Node process drive headless Claude Code the way the
// Storysync UI would? This runner stands in for the UI's server:
//
// 1. starts an HTTP endpoint that answers approval requests (the UI's
//    "Approve" button), with a fixed policy and a log
// 2. spawns `claude -p` with Storybook MCP and Storysync's MCP server added,
//    and permission prompts routed to Storysync's `approve` tool
// 3. turns Claude Code's stream-json output into progress events
// 4. writes everything to results/ for the research note
//
// Usage: node spikes/s5-headless-claude-code/run.mjs
// Env:   SPIKE_FIGMA_FILE (required), SPIKE_STORYBOOK_URL, SPIKE_MODEL

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, "results");
fs.mkdirSync(resultsDir, { recursive: true });

const FIGMA_FILE = process.env.SPIKE_FIGMA_FILE;
const STORYBOOK_URL = process.env.SPIKE_STORYBOOK_URL ?? "http://localhost:6006";
const MODEL = process.env.SPIKE_MODEL ?? "sonnet";
if (!FIGMA_FILE) throw new Error("Set SPIKE_FIGMA_FILE to the key of a Figma file the spike may write to.");

const started = Date.now();
const t = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`;
const events = [];
const approvals = [];
const emit = (kind, detail) => {
  const e = { at: t(), kind, ...detail };
  events.push(e);
  console.log(`${e.at.padStart(8)}  ${kind.padEnd(10)} ${detail.summary ?? ""}`);
};

// --- 1. Approval endpoint (stands in for the UI) -----------------------------
// Policy for the spike, standing in for a user's clicks: deny Bash and Write,
// and deny any call whose input contains the marker "deny-test" (a rejected
// Figma write). Allow everything else.
const approvalServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const request = JSON.parse(body);
    const allow = !["Bash", "Write"].includes(request.tool_name) && !JSON.stringify(request.input).includes("deny-test");
    approvals.push({ at: t(), tool: request.tool_name, allow, input: request.input });
    emit("approval", { summary: `${allow ? "ALLOW" : "DENY "} ${request.tool_name}` });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(allow ? { allow: true } : { allow: false, message: "Shell commands are not allowed from the Storysync UI." }));
  });
});
await new Promise((r) => approvalServer.listen(0, "127.0.0.1", r));
const approvalUrl = `http://127.0.0.1:${approvalServer.address().port}/approve`;

// --- 2. MCP config for this run ----------------------------------------------
const mcpConfig = {
  mcpServers: {
    storybook: { type: "http", url: new URL("/mcp", STORYBOOK_URL).toString() },
    storysync: {
      type: "stdio",
      command: process.execPath,
      args: [path.join(here, "storysync-mcp.mjs")],
      env: { SPIKE_APPROVAL_URL: approvalUrl, SPIKE_STORYBOOK_URL: STORYBOOK_URL },
    },
  },
};
const mcpConfigPath = path.join(resultsDir, "mcp-config.json");
fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

const TASK = process.env.SPIKE_TASK ?? "write";

const denyPrompt = `You are running inside an automated test of the Storysync UI. Do these steps in order and keep going if one is denied, noting the denial message.

1. Use the Write tool to create the file spike-deny-test.txt containing "x".
2. Use the Figma MCP's use_figma tool on file key ${FIGMA_FILE} to run exactly this code (it is a no-op):
// deny-test
return figma.root.name;
3. Use the Figma MCP's use_figma tool on file key ${FIGMA_FILE} to run exactly this code, which removes the frame an earlier test created:
const node = await figma.getNodeByIdAsync("${process.env.SPIKE_CLEANUP_NODE ?? ""}");
if (node) node.remove();
return { removed: !!node };
4. Finish with a JSON object on the last line of your reply, with keys: writeResult, deniedFigmaResult, cleanupResult. Do not retry denied steps another way.`;

const writePrompt = `You are running inside an automated test of the Storysync UI. Do these steps in order and keep going if one fails, noting the failure.

1. Use the Storybook MCP server ("storybook") to list the documented components. Report how many there are.
2. Call the storysync tool "storysync_list_components". Report its count.
3. Run the shell command \`echo hello\` with the Bash tool. It may be denied; if so, report the denial message and continue.
4. Use the Figma MCP to check which Figma account you are signed in as (whoami).
5. Use the Figma MCP's use_figma tool on file key ${FIGMA_FILE} to run this plugin code exactly:

const page = figma.root.children[0];
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const frame = figma.createFrame();
frame.name = "storysync-spike-S5";
frame.resize(320, 80);
frame.x = 0; frame.y = 0;
const label = figma.createText();
label.characters = "Written by headless Claude Code (spike S5)";
frame.appendChild(label);
label.x = 16; label.y = 30;
page.appendChild(frame);
return { id: frame.id, name: frame.name };

6. Finish with a JSON object on the last line of your reply, with keys: storybookCount, storysyncCount, bashResult, figmaAccount, figmaNodeId, problems.`;
const prompt = TASK === "deny" ? denyPrompt : writePrompt;
fs.writeFileSync(path.join(resultsDir, `prompt-${TASK}.txt`), prompt);

// --- 3. Spawn headless Claude Code -------------------------------------------
const args = [
  "-p",
  "--output-format", "stream-json",
  "--verbose",
  "--model", MODEL,
  "--mcp-config", mcpConfigPath,
  "--permission-prompt-tool", "mcp__storysync__approve",
  "--max-turns", "30",
];
emit("start", { summary: `claude ${args.join(" ")}` });

const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
child.stdin.end(prompt);

const transcript = fs.createWriteStream(path.join(resultsDir, `stream-${TASK}.jsonl`));
let stderr = "";
child.stderr.on("data", (c) => (stderr += c));

let buffer = "";
let result = null;
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
    if (msg.type === "system" && msg.subtype === "init") {
      emit("init", {
        summary: `model=${msg.model} mcp=[${msg.mcp_servers.map((s) => `${s.name}:${s.status}`).join(", ")}]`,
        mcp_servers: msg.mcp_servers,
        figmaTools: msg.tools.filter((x) => /figma/i.test(x)),
      });
    } else if (msg.type === "assistant") {
      for (const part of msg.message.content) {
        if (part.type === "tool_use") emit("tool_use", { summary: part.name, tool: part.name });
        if (part.type === "text" && part.text.trim()) emit("text", { summary: part.text.trim().split("\n")[0].slice(0, 100) });
      }
    } else if (msg.type === "user") {
      for (const part of msg.message.content ?? []) {
        if (part.type === "tool_result") {
          const body = Array.isArray(part.content) ? part.content.map((c) => c.text ?? "").join(" ") : String(part.content ?? "");
          emit("result", { summary: `${part.is_error ? "ERROR " : ""}${body.replace(/\s+/g, " ").slice(0, 100)}` });
        }
      }
    } else if (msg.type === "result") {
      result = msg;
      emit("done", { summary: `${msg.subtype} turns=${msg.num_turns} cost=$${msg.total_cost_usd?.toFixed(3)} ${msg.duration_ms}ms` });
    }
  }
});

const exitCode = await new Promise((r) => child.on("close", r));
approvalServer.close();
transcript.end();

const summary = {
  model: MODEL,
  exitCode,
  durationMs: Date.now() - started,
  result: result && { subtype: result.subtype, turns: result.num_turns, costUsd: result.total_cost_usd, text: result.result },
  approvals,
  toolsUsed: events.filter((e) => e.kind === "tool_use").map((e) => e.tool),
  init: events.find((e) => e.kind === "init"),
  stderr: stderr.slice(0, 2000),
};
fs.writeFileSync(path.join(resultsDir, `summary-${TASK}.json`), JSON.stringify(summary, null, 2));
console.log(`\nexit ${exitCode}; summary in ${path.relative(process.cwd(), resultsDir)}/summary-${TASK}.json`);
