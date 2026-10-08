# Spike S5b: a two-way session with headless Claude Code

Builds on [S5](../s5-headless-claude-code/) and reuses its MCP server. Results: [research note](../../docs/research/2026-10-07-s5b-two-way-session.md).

`run.mjs` holds one Claude Code process open (`--input-format stream-json`) and sends three scripted user turns. The stand-in UI answers `AskUserQuestion` through the approval tool.

```bash
# from the repo root, with `pnpm build` done and a Storybook with addon-mcp running
SPIKE_STORYBOOK_URL=http://localhost:6006 node spikes/s5b-two-way-session/run.mjs
```

No Figma writes. Output goes to `results/` (gitignored).
