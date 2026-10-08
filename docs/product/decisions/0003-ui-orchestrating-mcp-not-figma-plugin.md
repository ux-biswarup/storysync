# 0003. Build a UI that orchestrates MCP tools, not a Figma plugin

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P2, P3

## Context

Designers and PMs can't use Storysync today: it's CLI-only, and pushing needs an AI coding client ([0002](0002-serve-designers-engineers-and-pms.md)). [Open questions](../open-questions.md) P2 and P3 offered a terminal wizard, a Storybook addon panel, a local web app or a Figma plugin as the UI, and an AI agent or a Figma plugin as the writer.

## Decision

1. **Build a UI.** It works by orchestrating existing tools: **Figma MCP, Claude, Storybook MCP, the Storysync CLI**, and others as needed.
2. **No Figma plugin.** Writing to Figma goes through Figma MCP (`use_figma`), driven by Claude.

## Options considered

| Option | For | Against |
|---|---|---|
| Terminal wizard only | Cheapest | Not usable by designers or PMs |
| Storybook addon panel | Close to engineers' workflow | Another addon to install in the user's repo; not where designers or PMs work |
| Figma plugin (UI and writer) | Deterministic; designers stay in Figma | New codebase and publishing; doesn't serve PMs; data has to be moved from CLI to plugin; rejected by the decider |
| **UI orchestrating MCP tools** | One place for all three roles; reuses Figma MCP and Storybook MCP rather than replacing them; Claude handles the steps that need judgement | Depends on Claude and on Figma MCP's limits and auth; non-deterministic writing remains (mitigated by `verify`) |

## Consequences

- [ADR 0005](../../architecture/adr/0005-figma-writer.md): the agent path is the writer. Moving the Figma code into templates matters more now, to make the agent's writes faster and more predictable.
- New architecture decision for how the UI is built and how it reaches Claude and the MCP servers: [ADR 0006](../../architecture/adr/0006-ui-orchestration-architecture.md).
- Each user (or the team) needs Claude access and a Figma seat that can write.
- Still open: **where the UI runs**, locally per user or hosted for the team (P8). PMs would benefit most from hosted.
