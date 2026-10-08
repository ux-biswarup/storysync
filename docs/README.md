# Storysync docs

This folder holds the docs for building Storysync: how it is built, why it is built that way, what we plan to change, and the evidence behind those plans. User-facing documentation stays in the root [README](../README.md).

## Layout

| Folder | What goes in it | Start with |
|---|---|---|
| [architecture/](architecture/) | How the system is built, and how we want it built | [current-state.md](architecture/current-state.md) |
| [architecture/adr/](architecture/adr/) | Architecture Decision Records: one file per decision | [adr/README.md](architecture/adr/README.md) |
| [product/](product/) | The problem, who has it, and product decisions | [problem-statement.md](product/problem-statement.md) |
| [ux/](ux/) | User journeys, friction, and UI/UX decisions | [current-journey.md](ux/current-journey.md) |
| [plans/](plans/) | Implementation plans, broken into phases with acceptance criteria | [implementation-plan.md](plans/implementation-plan.md) |
| [research/](research/) | Field tests, spikes and experiments, dated | [research/README.md](research/README.md) |

## Conventions

- **Decisions are records, not edits.** A decision gets its own numbered file in the matching log (`architecture/adr/`, `product/decisions/`, `ux/decisions/`). To change a decision, write a new record that supersedes the old one, and set the old one's status to `Superseded by NNNN`. The `record-decision` skill in `.claude/skills/` does this.
- **Every claim about a problem links to evidence**: a research note, an issue, or a file and line in the code.
- **Status lives at the top of each doc**: `Draft`, `Proposed`, `Accepted`, `Superseded` or `Rejected`.
- **Research notes are dated** (`YYYY-MM-DD-topic.md`) and never rewritten afterwards. They record what was true on that day.
- **Diagrams are Mermaid**, so they render on GitHub and diff as text.

## Skills for working on these docs

| Skill | Use it to |
|---|---|
| `record-decision` | Add an architecture, product or UX decision record with the right number, template and index entry |
| `field-test` | Run Storysync against a real Storybook, and write up what worked and what didn't as a research note |

These skills live in [`.claude/skills/`](../.claude/skills/) and are for people working on Storysync. Don't confuse them with the repo's top-level [`skills/`](../skills/) folder, which holds the skill files Storysync ships to its users.
