# Spike S8: Figma component → proper code in a real library, by headless Claude Code

**Date:** 2026-10-07
**Question:** Can Claude Code, driven the way the Storysync UI would drive it, turn a designer's Figma component into a proper, reusable component in a real library, with nobody writing code? Measured against the "proper component" checklist in [product decision 0007](../product/decisions/0007-success-measure-layman-pushes-component.md). ([plan 0.12](../plans/implementation-plan.md))
**Code:** [spikes/s8-component-generation/](../../spikes/s8-component-generation/)

## Setup

| | |
|---|---|
| Design | **MetricTile** in the test Figma file (set `33:38`): label, large value, trend chip. `trend` (positive, negative, neutral) × `size` (normal, small) = 6 variants. **Drawn from scratch** ([0010](../product/decisions/0010-support-scratch-and-library-based-components.md)), every raw value equal to an existing library token. |
| Target | 4flow's Vue 3 + PrimeVue + Tailwind v4 library, in an isolated git worktree (detached, no branch, no commits) |
| Runner | The S5b design: one headless Claude Code session (`--input-format stream-json`), Storysync's role in `--append-system-prompt`, approvals by a scripted "UI": allow work in the worktree; block git changes, installs, `curl`, and edits outside the worktree |
| Model | Sonnet (`claude-sonnet-4-6`) |
| Request | As a designer would write it: "add it to our component library as a proper, reusable component, with all its variants in Storybook. Use our existing tokens." |

The library has its own AI guidance: `CLAUDE.md`, `AGENTS.md` (conventions, PrimeVue wrapping, Storybook rules, completion checklist), and a `figma-styling` skill. Claude Code loaded these automatically.

## What Claude made

| File | Content |
|---|---|
| `src/components/metric-tile/MetricTile.vue` | `<script setup lang="ts">`, typed props with `withDefaults`, Tailwind classes using the library's CSS variables |
| `types.ts`, `index.ts` | `MetricTileTrend`, `MetricTileSize`; named export, same pattern as Tag and Badge |
| `metric-tile.stories.ts` | Docs story, `TrendVariants`, `SizeVariants`, `StateMatrix`, and 6 test stories (defaults, each trend, small size) |
| `src/index.ts`, `package.json` | Barrel export and the `./metric-tile` subpath export |

**Time and cost:** 19 minutes and **$3.32**, over 73 model turns. The component itself was finished after 6.5 minutes and $1.72. The rest was two runner follow-ups (see R7), which Claude used to align details with the library's conventions and to run the full test suite twice (about 4 minutes each). It asked **no** questions. 33 tool calls went through approval, and 2 were denied.

## Results against the "proper component" checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Follows the library's conventions | ✅ mostly | File set, prop typing, `withDefaults`, size vocabulary (`normal`/`small`), story structure with test stories, exports. One deviation: folder `metric-tile`. `AGENTS.md` says "kebab-case", but every existing multi-word folder is joined (`emptystate`, `toggleswitch`), so docs and practice disagree. |
| 2 | Reuses existing tokens **and components** | ❌ | Tokens ✅: every colour, radius and spacing value is a library variable. Two values with no exact token (28px value text, 6px chip padding) were **documented in a comment**, not hidden. **Components ❌: the library already has `Card` with `variant="kpi"`** (metric figure, label, size, trend label, and separate trend direction and sentiment). MetricTile duplicates it. |
| 3 | A story for each variant | ✅ | `TrendVariants`, `SizeVariants`, `StateMatrix` cover all 6 |
| 4 | Fidelity ≥ 95% against Figma | ❌ 91.3% | 126/138 properties. **All colours, font sizes, weights, padding, gaps and radii match.** All 12 failures are width and height (see R2). |
| 5 | Builds cleanly | ✅ | `npm run typecheck` passes (re-run independently). Full suite: 1306/1306 tests across 53 files, including the 6 new ones. (`check:exports` can't run on Windows; it fails before any change, a library issue.) |
| 6 | An engineer accepts it unchanged | ❌ (expected) | The duplication with `Card` would most likely be rejected in review |

## Findings

| # | Finding | What Storysync must do |
|---|---|---|
| **R1** | **Generating library-quality code works.** Given the library's own guidance, Claude produced code that looks like the team's: right structure, tokens, stories, tests, exports. In 6.5 minutes. | Treat the repo's own `CLAUDE.md`/`AGENTS.md`/skills as the primary conventions source. Plan 6.2 becomes "use and complete them", not "learn from scratch". |
| **R2** | **Sizing intent is lost.** Width: Figma has fixed 240/200px frames, while the code shrinks to its content. That's a real question: should a tile be fixed, or fill its container? Height: 5-11px taller, because Figma's text has "auto" line height and the code inherits Tailwind's line heights. | The design reader must capture **sizing mode** (fixed, hug, fill) and **line height**, and anything ambiguous goes to the designer as a question. The repair loop (plan 6.6) feeds measured size differences back to Claude. |
| **R3** | **Reuse failed: the biggest finding.** Claude studied Tag, Badge and EmptyState for patterns, but never searched for a component that already *does this*. Nor did the designer (me) who drew it. A from-scratch design invites duplicates. | Add a mandatory **reuse check before generating**: search the library (Storybook docs, story names, Code Connect) for components with the same purpose. If one exists, ask the designer: *use Card (kpi) as is / add what's missing to Card / make a new component anyway*. This is the "suggest existing components" step in [0010](../product/decisions/0010-support-scratch-and-library-based-components.md), and S8 shows it can't be left to the model's initiative. |
| **R4** | **No questions asked.** Claude had AskUserQuestion available and was told to use it, but made every judgement itself: tokens with no exact match, width, duplication. | The procedure must name the decisions that **require** the designer (reuse, new tokens, sizing), rather than leaving it to Claude to decide whether to ask. |
| **R5** | **Token gaps are handled honestly, but quietly.** The two values with no token were written as Tailwind values with a comment. Claude also mixed semantic tokens (`--sem-…`) and primitive ones (`--pri-…`) and Tailwind's type scale. | Surface token gaps as "new token?" decisions in the UI (0010). Let the conventions source say which token layer components should use. |
| **R6** | **The sandbox policy needs refining.** Too strict: it blocked `curl` to Claude's own `localhost` Storybook, and reading Claude Code's own background-task output. Too loose: path checks applied only to Write/Edit, not to `cd` in Bash; Claude could stop a process by PID (here its own Storybook); and **processes it started outlived the session** (a Storybook left on 6006). | The UI runner must: allow `localhost` and Claude Code's temp folder; check Bash working directories; only allow stopping processes the session started; and **stop every process the session started when the task ends**. |
| **R7** | **Completion detection by parsing text is fragile.** Claude put its final JSON in a code block, so the runner sent two unnecessary follow-ups (useful here, but extra cost). | End tasks with a typed **`storysync_submit_result` tool** on Storysync's MCP server, rather than parsing the reply. |
| **R8** | **Cost and time are acceptable.** $1.72 and 6.5 min for the component, $3.32 and 19 min in total. That's under the 30-minute target in 0007. | Measure again with the reuse check and repair loop added. Consider skipping the full test suite in favour of the component's own tests. |

**Measurement note:** `measure.mjs` sets story args in the URL. Storybook ignores args containing `%` and `,`, so the text overrides didn't apply and the default text rendered. Colours and sizes come from `trend` and `size`, which did apply, so the score is unaffected.

## Conclusion

**The north star is reachable, and what's missing is in Storysync's pipeline rather than the model.** Claude Code wrote code an engineer would recognise as their own, matched every style property to the design through tokens, and passed type-check and 1306 tests, unattended, in under 7 minutes. It failed where Storysync gave it nothing to go on: **whether the component should exist at all** (R3), and **sizing intent** the design reader didn't extract (R2). Both are fixable before Phase 6, and both make the case for the change-set preview and the designer's decisions in the UI.

## Left in place

- The MetricTile component set stays in the test Figma file, for future experiments.
- The worktree `C:\Personal\projects\vue-component-library-s8` keeps the generated code for review. Remove it with `git worktree remove ../vue-component-library-s8 --force` from the main library.
