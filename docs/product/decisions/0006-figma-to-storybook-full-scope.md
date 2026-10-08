# 0006. Figma → Storybook covers everything, up to full component code

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** P7

## Context

[0004](0004-add-figma-to-storybook-after-usability.md) added Figma → Storybook after usability and left its scope open. P7 offered four levels: drift report, tokens, stories, component code.

## Decision

**All levels.** A designer makes a component in Figma and pushes it to Storybook as a proper, reusable component in the codebase, with no hand coding. Building a component no longer depends on someone else having the time to do it.

That includes:
- tokens: Figma variables → the project's token files
- new components: code, stories and anything the library's conventions require (types, tests, exports)
- changes to existing components: new variants, props and style changes

## Options considered

| Option | For | Against |
|---|---|---|
| Report only | No risk | Doesn't remove the hand-off |
| Tokens and stories only | Lower risk | Doesn't let designers create components |
| **Everything, up to component code** | Removes the hand-off; matches the success measure ([0007](0007-success-measure-layman-pushes-component.md)) | Highest risk: generated code must be good enough to keep |

## Consequences

Upstream's warning applies in full: in this direction, "an LLM's mistakes are hardest to notice". So the design needs these guardrails (to be specified in an ADR, plan item 6.1):

1. **Follow the library's own conventions.** Generated code must look like the code already in the repo: file layout, styling approach, prop typing, story format, wrappers around the base library (e.g. PrimeVue). Storysync learns these from the existing components (plan item 6.2).
2. **Reuse before creating.** Use existing components and tokens when the Figma design contains them (Figma Code Connect and the token map).
3. **Prove it.** After generating, build Storybook, measure the new component with `snap`, and score it against the Figma design with `verify`, the same proof the forward direction has.
4. **Quality gates:** type-check, lint and tests must pass.
5. **Delivered as a pull request**, so an engineer can review it before it merges.
