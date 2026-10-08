# 0004. Add Figma → Storybook as a second direction, after usability

**Status:** Accepted (direction and order). Scope to be defined in P7.
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** new direction (no prior question)

## Context

Storysync syncs one way, Storybook → Figma. Upstream lists Figma → code as a **non-goal**: "That's the direction where an LLM's mistakes are hardest to notice" ([README.md, Non-goals](../../../README.md#non-goals)). But designers often change a component in Figma first, and today that change reaches code by hand.

## Decision

1. **Order:** first make the existing direction usable for designers, engineers and PMs ([0002](0002-serve-designers-engineers-and-pms.md), [0003](0003-ui-orchestrating-mcp-not-figma-plugin.md)). Then build **Figma → Storybook**, so designers can carry their changes into Storybook.
2. **This reverses upstream's non-goal for this fork.** The root README's non-goals stay as they are until the feature ships.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep one direction | Smaller; follows upstream's reasoning | Designers' changes still reach code by hand |
| Build both directions now | Delivers the full loop sooner | Splits effort before the first direction is usable |
| **Usability first, then Figma → Storybook** | Builds the reverse direction on a UI and setup that already work | The reverse direction waits |

## Consequences

- Upstream's concern still stands: mistakes are hard to notice in this direction. It needs the same safeguards as the existing one, a proposed change that can be reviewed and checked, not a silent write. That should be shaped by P7 and a future ADR.
- The existing `diff` command (Figma vs code drift) is the natural starting point: it already finds what changed in Figma.
- Writing to the user's code is a much bigger trust step than writing to Figma. The output probably needs to be a reviewable branch or PR, not direct edits.

## Follow-up

- New open question **P7**: what exactly does Figma → Storybook produce? Token changes only? Story args? Component code? A PR?
- Plan: new Phase 6.
