# 0009. Use Claude Code as the only AI runtime, for now

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** spikes S5 and S6 (which AI runtime the UI uses)

## Context

[ADR 0006](../../architecture/adr/0006-ui-orchestration-architecture.md) proposed running the Claude Agent SDK inside the UI's server, and flagged the biggest unknown: whether a custom app can authenticate to Figma MCP and call `use_figma`, which upstream says works only in supported clients. Claude Code is one of those supported clients.

## Decision

The UI uses **Claude Code** as its only AI runtime. The UI's server drives the user's installed, logged-in Claude Code in headless mode. Claude Code connects to Figma MCP, Storybook MCP and Storysync. Cursor, Codex and other MCP clients come later.

## Options considered

| Option | For | Against |
|---|---|---|
| **Claude Code only** | A supported Figma MCP client; reuses the user's login and Figma connector; no API keys to manage; one runtime to make reliable | Every user needs Claude Code; tied to one vendor for now |
| Claude Agent SDK in our server | Full control of the agent loop | Figma MCP auth unproven; needs API keys |
| Several AI clients from the start | Wider reach | Triples the testing; slower to a working product |

## Consequences

- Spike S6 (Claude auth) is settled: each user's own Claude Code login.
- Spike S5 changes: can the local server drive Claude Code headlessly, with Figma MCP available, approvals routed to the UI, and progress streamed? See [ADR 0006](../../architecture/adr/0006-ui-orchestration-architecture.md).
- The existing Cursor and Codex skill files keep working for engineers, but the UI doesn't use them in v1.
