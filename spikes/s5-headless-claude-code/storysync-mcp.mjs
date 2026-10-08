// Spike S5: a stand-in for Storysync's own MCP server.
//
// Claude Code starts this over stdio. It exposes:
// - `approve`: the permission-prompt tool. Every permission request Claude Code
//   would show a human is sent here; we forward it to the runner (standing in
//   for the UI) over HTTP and wait for its decision.
// - `storysync_list_components`: one real Storysync app service as a typed tool,
//   so the agent doesn't need to shell out to the CLI.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StorybookClient } from "../../dist/cli/storybook.js";

const APPROVAL_URL = process.env.SPIKE_APPROVAL_URL;
const STORYBOOK_URL = process.env.SPIKE_STORYBOOK_URL ?? "http://localhost:6006";

const TOOLS = [
  {
    name: "approve",
    description: "Permission prompt handler: asks the Storysync UI whether a tool call may run.",
    inputSchema: {
      type: "object",
      properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } },
      required: ["tool_name", "input"],
    },
  },
  {
    name: "storysync_submit_result",
    description: "Call this exactly once, as your last action, to hand the finished task back to the Storysync UI.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Plain-language summary for the designer." },
        outcome: { type: "string", enum: ["created", "reused", "extended", "nothing"], description: "What happened to the component." },
        files: { type: "array", items: { type: "string" } },
        decisions: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, recommended: { type: "string" } } } },
        existingComponentsConsidered: { type: "array", items: { type: "string" } },
        tokenGaps: { type: "array", items: { type: "string" }, description: "Design values with no exact token, and how each was handled." },
        checks: { type: "object", description: "Results of type check and tests." },
        openQuestions: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "outcome", "files", "decisions", "checks"],
    },
  },
  {
    name: "storysync_list_components",
    description: "List the components in the running Storybook, using Storysync's own Storybook client.",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

async function approve({ tool_name, input, tool_use_id }) {
  const res = await fetch(APPROVAL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool_name, input, tool_use_id }),
  });
  const decision = await res.json();
  // The UI may change the input, e.g. to fill in answers to AskUserQuestion.
  return text(
    decision.allow
      ? { behavior: "allow", updatedInput: decision.updatedInput ?? input }
      : { behavior: "deny", message: decision.message ?? "Denied in the Storysync UI." },
  );
}

async function listComponents() {
  const client = new StorybookClient(STORYBOOK_URL);
  await client.connect();
  try {
    const components = await client.listComponents();
    return text({ count: components.length, names: components.map((c) => c.name) });
  } finally {
    await client.disconnect();
  }
}

const server = new Server({ name: "storysync", version: "0.0.0-spike" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  if (name === "approve") return approve(args);
  if (name === "storysync_list_components") return listComponents();
  if (name === "storysync_submit_result") {
    await fetch(APPROVAL_URL.replace(/\/approve$/, "/result"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    return text({ received: true });
  }
  throw new Error(`Unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
