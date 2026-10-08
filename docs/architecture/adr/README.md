# Architecture Decision Records

One file per decision, numbered in order. Copy [template.md](template.md), or use the `record-decision` skill.

**Statuses:** `Proposed` → `Accepted` or `Rejected`. An accepted record is not edited. To change it, write a new record and set the old one to `Superseded by NNNN`.

| # | Decision | Status | Solves |
|---|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs | Accepted | |
| [0002](0002-storybook-source-adapters.md) | Read Storybook through source adapters (MCP and static) | Proposed | A1, A10 |
| [0003](0003-framework-profiles.md) | Describe framework requirements as data profiles | Accepted | A2 |
| [0004](0004-project-config-file.md) | Add a project config file, `storysync.config.json` | Accepted | A5, A6 |
| [0005](0005-figma-writer.md) | Put Figma writing behind a `FigmaWriter` interface; single-source the skills | Proposed (writer settled: agent via Figma MCP) | A7 |
| [0006](0006-ui-orchestration-architecture.md) | Build the UI as a local web app that drives headless Claude Code | Accepted | A8 |
