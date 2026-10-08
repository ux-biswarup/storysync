# 0005. Run the UI locally on each person's machine first; host it later if it works

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P8

## Context

The UI ([0003](0003-ui-orchestrating-mcp-not-figma-plugin.md)) could run locally per user or be hosted for the team ([open questions, P8](../open-questions.md)). Hosting needs sign-in, secrets on a server, and a Storybook the server can reach. Running locally reuses each person's own Claude Code login, Figma access and local Storybook.

## Decision

Build and test the UI **locally first** (`npx storysync ui` on each person's machine). If it works, move to hosting.

## Options considered

| Option | For | Against |
|---|---|---|
| **Local first, hosted later** | Ships sooner; no server secrets; works with a local Storybook and repo | Designers and PMs need Node and Claude Code installed |
| Hosted from the start | One link for everyone | Hosting, auth and secrets before we know the workflow works |

## Consequences

- Each user needs Node, Claude Code (logged in) and the Figma connector. Setting these up must be part of the guided onboarding (plan item 2.8 and the UI's setup screen).
- The server is written so it can be hosted later: no assumption that browser and server share a machine beyond `localhost` defaults.
- Hosting brings back published-Storybook support and user auth, deferred until then ([0008](0008-v1-scope.md)).
