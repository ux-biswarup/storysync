# 0001. Develop in the `ux-biswarup/storysync` fork; decide on upstreaming later

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P5

## Context

Storysync is an open-source project (`brendanciccone/storysync`, MIT). The direction in [the implementation plan](../../plans/implementation-plan.md) goes further than the upstream project's stated scope: a UI for designers and PMs, and later Figma → Storybook, which upstream lists as a non-goal ([README.md, Non-goals](../../../README.md#non-goals)). Agreeing that direction with the upstream maintainer first would slow the work down.

## Decision

All work happens in the fork, `https://github.com/ux-biswarup/storysync`, with commits made as the GitHub user `ux-biswarup`. Whether, and which parts, go back upstream is decided later.

## Options considered

| Option | For | Against |
|---|---|---|
| Contribute upstream from the start | Shared maintenance; wider reach | Needs upstream agreement on a broader direction; slower |
| **Fork now, decide later** | Full control and speed; upstreaming stays possible | We maintain it; it drifts from upstream over time |
| Fork permanently | Simplest | Gives up general fixes others could benefit from |

## Consequences

- Phase 1 items (bug fixes) stay general and small, so they stay easy to offer upstream later.
- The fork needs syncing with upstream from time to time to avoid painful merges.
- The npm package name `storysync` belongs to upstream. Publishing from the fork would need a different name, and that decision is deferred.
