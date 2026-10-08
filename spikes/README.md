# Spikes

Throwaway experiments that answer one question each. The code here is not product code: it is kept so a result can be rerun. Findings go in [docs/research/](../docs/research/).

| Spike | Question | Result |
|---|---|---|
| [s5-headless-claude-code](s5-headless-claude-code/) | Can a local Node server drive headless Claude Code with Figma MCP, Storybook MCP, our own tools, and approvals in our UI? | ✅ Yes, with four design changes. [Research note](../docs/research/2026-10-07-s5-headless-claude-code.md) |
| [s5b-two-way-session](s5b-two-way-session/) | Can the UI answer Claude's questions and hold a multi-turn session? | ✅ Yes, both structured and free-text questions. [Research note](../docs/research/2026-10-07-s5b-two-way-session.md) |
| [s8-component-generation](s8-component-generation/) | Can headless Claude Code turn a Figma component into proper code in a real library? | ⚠️ Code quality yes (typecheck, 1306 tests, conventions); 91.3% fidelity; duplicated an existing component. [Research note](../docs/research/2026-10-07-s8-component-generation.md) |
| [s8b-guided-generation](s8b-guided-generation/) | Does a guided procedure fix S8's failures? | ⚠️ Questions ✅, fidelity 95.7% ✅, 10 min / $1.93; reuse still missed: needs a deterministic search. [Research note](../docs/research/2026-10-07-s8b-guided-generation.md) |

Run output goes to each spike's `results/` folder, which is gitignored because transcripts can contain account details.
