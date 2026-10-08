# Research

Field tests, spikes and experiments. Each note is named `YYYY-MM-DD-topic.md` and is not edited after the day it was written. If a later test changes the picture, write a new note and link back to the old one.

| Date | Note | Summary |
|---|---|---|
| 2026-10-07 | [Vue component library field test](2026-10-07-vue-library-field-test.md) | First run against a production Vue 3 + PrimeVue library. Works after four manual fixes; tokens partly extracted. |
| 2026-10-07 | [Spike S5: headless Claude Code](2026-10-07-s5-headless-claude-code.md) | A local server can drive headless Claude Code with Figma MCP, Storybook MCP, our own tools and UI approvals. Passed on Windows, with four design changes. |
| 2026-10-07 | [Spike S5b: two-way session](2026-10-07-s5b-two-way-session.md) | The UI can answer Claude's questions (structured and free text) and hold a multi-turn session per task. Role as system context and tool blocking work. |
| 2026-10-07 | [Spike S8: component generation](2026-10-07-s8-component-generation.md) | Claude Code generated library-quality Vue code from a Figma design in 6.5 min ($1.72): typecheck and 1306 tests pass, 91.3% fidelity. It duplicated an existing component (Card kpi) and lost sizing intent. Needs a reuse check and better design reading. |
| 2026-10-07 | [Spike S8b: guided generation](2026-10-07-s8b-guided-generation.md) | S8 with a guided procedure: 3 good questions before coding, fidelity 95.7%, 10 min / $1.93. Still missed `Card` (kpi): the reuse check and "auto" line heights must be done by Storysync, not by prompting. |
| 2026-10-07 | [Vue library field test after Phase 1](2026-10-07-vue-library-phase1-field-test.md) | Phase 1 acceptance met: from a fresh clone, 0 hand edits (`init` adds the Vue flag after asking), tokens found with reasons, components listed first time. New: named union types (`ButtonSeverity`) hide most missing variants. |
| 2026-10-08 | [Phase 2 acceptance](2026-10-08-phase2-acceptance.md) | `npx storysync` then `doctor` on fresh copies: example 11 ok, Vue library 13 ok, no hand edits. Found: Claude Code shares local MCP servers across worktrees, so registration must never replace a different entry (fixed). |
