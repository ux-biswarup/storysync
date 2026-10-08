# 0007. Success: a non-developer pushes a proper, reusable component to Storybook without writing code

**Status:** Accepted (measure and checklist; checklist and 95% threshold confirmed for Q1 on 2026-10-07). Targets are proposed.
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P6

## Decision

Storysync succeeds when **a layperson pushes a component from Figma to Storybook, as proper code for a reusable component, without writing a single line of code.** All the coding is done by Claude Code (or, later, another AI working through MCP).

## What "proper" means (proposed checklist)

A component counts only if **all** of these are true. Each one can be checked automatically, so the measure is objective:

| # | Check | How it's checked |
|---|---|---|
| 1 | Follows the library's conventions: file layout, naming, styling approach, prop types, exports | Compared with the conventions profile (plan item 6.2); engineer review |
| 2 | Reuses existing tokens and components instead of hard-coded values | No raw colours or spacing where a token exists (lint rule or check) |
| 3 | Has a story for each variant in Figma | `storysync map` lists every Figma variant |
| 4 | Looks like the Figma design | `snap` + `verify` fidelity ≥ 95% against Figma |
| 5 | Builds cleanly | Type-check, lint and the library's tests pass |
| 6 | An engineer accepts it | Pull request merged without hand-written code changes |

The user writes no code, doesn't edit files, and doesn't use a terminal beyond starting the UI.

## Targets (proposed)

| Measure | Target |
|---|---|
| Laypeople in a test session who push a component end to end without help | 4 of 5 |
| Time from "component ready in Figma" to "PR open" | < 30 minutes |
| PRs merged without hand-written code changes | ≥ 80% |

## Options considered

| Option | For | Against |
|---|---|---|
| Measure setup time and fidelity only | Easy to measure | Doesn't test the actual goal |
| **A layperson pushes a proper component with no code** | Tests the full promise end to end | Depends on Phase 6; "proper" needs the checklist above to be objective |

## Consequences

- The north-star test is a Phase 6 outcome. Phases 1-4 are measured by whether they move towards it.
- The [problem statement](../problem-statement.md) targets are replaced by this measure.
- Test sessions with real laypeople (designers, PMs) are needed, written up in `docs/research/`.
