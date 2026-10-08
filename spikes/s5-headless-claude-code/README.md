# Spike S5: driving headless Claude Code

Stands in for the Storysync UI's server ([ADR 0006](../../docs/architecture/adr/0006-ui-orchestration-architecture.md)). Results: [research note](../../docs/research/2026-10-07-s5-headless-claude-code.md).

| File | Role |
|---|---|
| `run.mjs` | The "UI server": an approval endpoint, starts `claude -p` with an MCP config, turns its stream-json output into progress events |
| `storysync-mcp.mjs` | Storysync's MCP server: the `approve` permission-prompt tool, and `storysync_list_components` as one real app service |
| `selftest.mjs` | Checks the MCP server alone, without Claude |

## Run it

Needs: `pnpm build` in the repo root, Claude Code installed and logged in, a Figma connector or plugin in Claude Code, a Storybook with addon-mcp running, and a Figma file you can write to.

```bash
# from the repo root
node spikes/s5-headless-claude-code/selftest.mjs        # MCP server alone (uses port 6008)

# write test: reads Storybook, writes a frame to Figma
SPIKE_FIGMA_FILE=<file-key> SPIKE_STORYBOOK_URL=http://localhost:6006 \
  node spikes/s5-headless-claude-code/run.mjs

# deny test: the "user" rejects a file write and a Figma write; then removes the frame
SPIKE_TASK=deny SPIKE_CLEANUP_NODE=<node-id-from-write-test> SPIKE_FIGMA_FILE=<file-key> \
  node spikes/s5-headless-claude-code/run.mjs
```

`SPIKE_MODEL` defaults to `sonnet`. Output goes to `results/` (gitignored).
