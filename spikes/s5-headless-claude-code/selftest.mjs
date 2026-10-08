import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const c = new Client({ name: "selftest", version: "1" });
await c.connect(new StdioClientTransport({ command: process.execPath, args: ["spikes/s5-headless-claude-code/storysync-mcp.mjs"], env: { ...process.env, SPIKE_STORYBOOK_URL: "http://localhost:6008" } }));
console.log("tools:", (await c.listTools()).tools.map((t) => t.name).join(", "));
const r = await c.callTool({ name: "storysync_list_components", arguments: {} });
console.log("list:", r.content[0].text.slice(0, 120));
await c.close();
