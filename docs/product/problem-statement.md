# Problem statement

**Status:** Accepted. Users in [0002](decisions/0002-serve-designers-engineers-and-pms.md); success measure in [0007](decisions/0007-success-measure-layman-pushes-component.md).
**Last reviewed:** 2026-10-07

## The problem

Design systems live in two places: **code** (components in Storybook) and **design** (components and variables in Figma). They drift apart. Keeping Figma in step with code is manual, slow and error-prone. Designers end up working from components that no longer match what ships, and engineers get handoffs that don't match the real system.

Storysync solves the hard technical part: it **measures** components as they really render and builds matching Figma components, with a fidelity score that proves the match.

But **getting it to work is the new problem.** In our first real-world test ([Vue field test](../research/2026-10-07-vue-library-field-test.md)), a production design system took four manual fixes, and reading Storybook's compiled source, before a single component could be measured. Most teams would give up before seeing any value.

## Who has it

Decided in [0002](decisions/0002-serve-designers-engineers-and-pms.md): all three of these roles.

| Who | What they want | What stops them today |
|---|---|---|
| **Design system engineer** | Keep the Figma library true to the code without hand-building it | Setup in their Storybook repo; CLI-only; framework gaps |
| **Product designer** | Trust that Figma components match production | Needs an AI coding client and a terminal; can't run it themselves |
| **Design system lead** | See drift between design and code at a glance | No overview or reporting, only CLI output and CI pass/fail |

## What's in the way (from the field test and review)

1. **No visible experience.** Everything is commands and long text output. Users can't see what was found or what will change before it happens.
2. **Setup across two repos and three tools:** the Storysync CLI, the user's Storybook repo, the AI client's MCP config, and the Figma connector.
3. **Framework support looks narrower than it is.** Vue works, but only with undocumented flags, and the errors point the wrong way.
4. **Users must change their Storybook repo** (dependency, config, feature flags) and run a dev server, even when a published Storybook already exists.
5. **Partial results with no explanation:** tokens dropped by naming rules, props dropped by type, nothing reported.
6. **Pushing depends on an AI agent**, which makes it costly, slower and less predictable than the rest of the pipeline.
7. **Sync only goes one way.** Changes designers make in Figma reach Storybook by hand. Planned, after usability: [0004](decisions/0004-add-figma-to-storybook-after-usability.md).

## What "solved" looks like

**North star ([0007](decisions/0007-success-measure-layman-pushes-component.md)):** a non-developer pushes a component from Figma to Storybook, as proper code for a reusable component, without writing a line of code.

The measures below track progress on the way there, mostly in Phases 1-4:

| Measure | Today (field test) | Candidate target |
|---|---|---|
| Time from install to first measured component, on a real repo | ~1 hour plus source reading | < 10 minutes |
| Manual file edits needed in the user's repo | 4 | 0: the wizard applies every change, after asking |
| Setups that end with a clear, correct next step on failure | Low (wrong diagnosis at step 8) | 100% — every failure names the fix |
| Tokens in the user's sources that end up in Figma | Colours only (radius, type, shadows lost) | All, or listed with the reason |
| Fidelity of pushed components | 100% on the example | ≥ 98% on real libraries |
