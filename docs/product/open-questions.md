# Open product decisions

**Status:** All answered; P4 awaiting confirmation
**Last reviewed:** 2026-10-07

These need answers before parts of the [implementation plan](../plans/implementation-plan.md) can start. When a decision is taken, record it with the `record-decision` skill and mark it here.

| # | Question | State |
|---|---|---|
| P1 | Who is the primary user? | **Decided → [0002](decisions/0002-serve-designers-engineers-and-pms.md)**: designers, engineers and PMs; usability first |
| P2 | What form does the UI take? | **Decided → [0003](decisions/0003-ui-orchestrating-mcp-not-figma-plugin.md)**: a UI that orchestrates MCP tools; not a Figma plugin |
| P3 | How are components written to Figma? | **Decided → [0003](decisions/0003-ui-orchestrating-mcp-not-figma-plugin.md)**: through Figma MCP; no plugin |
| P4 | What does v1 support? | **Proposed → [0008](decisions/0008-v1-scope.md)**: Vue 3 + React, local Storybook, CSS and Tailwind v4 tokens, Windows and macOS. Awaiting confirmation. |
| P5 | Where does this work live? | **Decided → [0001](decisions/0001-develop-in-fork.md)**: the `ux-biswarup/storysync` fork |
| P6 | How do we measure success? | **Decided → [0007](decisions/0007-success-measure-layman-pushes-component.md)**: a non-developer pushes a proper, reusable component to Storybook without writing code |
| P7 | What does Figma → Storybook produce? | **Decided → [0006](decisions/0006-figma-to-storybook-full-scope.md)**: everything, up to full component code, as a PR |
| P8 | Where does the UI run? | **Decided → [0005](decisions/0005-run-ui-locally-first.md)**: locally first; hosted later if it works |
| — | Which AI runtime? | **Decided → [0009](decisions/0009-claude-code-only.md)**: Claude Code only, for now |

## Questions that came out of these decisions

| # | Question | Raised by | Needed by |
|---|---|---|---|
| Q1 | Does the "proper component" checklist in 0007 match what your engineers would accept? Is a 95% fidelity threshold right? | [0007](decisions/0007-success-measure-layman-pushes-component.md) | **Decided → yes**, recorded in [0007](decisions/0007-success-measure-layman-pushes-component.md) |
| Q2 | Who reviews and merges the generated PRs, and must every one be reviewed? | [0006](decisions/0006-figma-to-storybook-full-scope.md) | **Deferred**, to be decided before plan 6.7 |
| Q3 | Can a designer start a component from scratch in Figma, or must it be built from the library's Figma components? | [0006](decisions/0006-figma-to-storybook-full-scope.md) | **Decided → [0010](decisions/0010-support-scratch-and-library-based-components.md)**: both |
