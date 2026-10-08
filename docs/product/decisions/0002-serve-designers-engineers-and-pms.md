# 0002. Serve designers, engineers and PMs

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P1

## Context

Today Storysync only works for someone comfortable with a terminal, an AI coding client and a Storybook repo ([current journey](../../ux/current-journey.md)). The people who care about design and code staying in sync are a wider group:

| Who | Needs |
|---|---|
| **Designers** | Trust that Figma matches production; push and check sync without a terminal |
| **Engineers** | Keep the Figma library true to code with little effort; CI checks |
| **PMs** | See the state of the design system (what's in sync, what drifted) without running anything |

## Decision

Storysync is for all three. **Usability for non-engineers is the first goal**, before new capabilities.

## Options considered

| Option | For | Against |
|---|---|---|
| Engineers only | Smallest scope; terminal is fine | Leaves out the people who feel the drift most |
| Engineer sets up, designers use | Smaller scope than all three | Leaves out PMs |
| **Designers, engineers and PMs** | Matches who is affected | Each needs a different view; the UI has to work for all three |

## Consequences

- A UI is needed: see [0003](0003-ui-orchestrating-mcp-not-figma-plugin.md).
- Each role needs its own view of the same facts (UX principle 8). PMs mostly need reading, not acting.
- Problem-statement targets need measures per role (P6).
- Still open: **who does the one-time setup.** It probably stays with engineers, but the UI should lead them through it.
