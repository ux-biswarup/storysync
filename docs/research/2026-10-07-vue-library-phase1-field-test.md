# Field test: Vue component library, after Phase 1

**Date:** 2026-10-07
**Storysync version:** 0.3.0 at `9f8299a` plus the uncommitted Phase 1 changes ([plan, Phase 1](../plans/implementation-plan.md#phase-1-first-run-works))
**Target:** the same 4flow Vue component library as the [first field test](2026-10-07-vue-library-field-test.md), in a fresh detached worktree (`vue-component-library-p1`), installed with `npm ci`
**Environment:** Windows 11, Node 25.9, npm 11.12

## Question

Phase 1's acceptance test: from scratch, does the run need **no hand edits other than the feature flags, which `init` adds after confirming**, and does **every failure name its fix**?

## Target project

As in the first test, with one difference: a fresh `npm ci` installs Storybook 10.6.0, the version the lockfile pins. The first test had a stale `node_modules` (10.5.5), so the "lockfile ahead of node_modules" case doesn't occur here. It's covered by unit tests ([init-setup.test.ts](../../cli/__tests__/init-setup.test.ts)).

## What happened, step by step

| # | Step | Result | Fix needed |
|---|---|---|---|
| 1 | `storysync tokens` (auto-detect) | ✅ **331 colours.** "tailwind.config.ts has no theme, so its tokens must be in CSS; reading :root custom properties." ([tokens.ts:89](../../cli/tokens.ts#L89)) | None |
| 2 | Uncategorized tokens | ⚠️ 143 variables listed as 50 or so name prefixes, largest first: `--pri-spacing-*` (12), `--pri-typography-line-height-*` (9), `--pri-typography-size-*` (9), `--pri-radius-*` (7)…, plus the naming rule they missed ([index.ts:158](../../cli/index.ts#L158)) | None now. Getting them into categories is plan 3.3 |
| 3 | `tokens --source tailwind` | ✅ **328 colours from `@theme`** (was: "No tokens found") | None |
| 4 | `tokens --source theme` | ✅ "Source: theme (from --source)", no tokens (the library has no theme file). The label no longer claims detection. | None |
| 5 | `storysync init`, answering yes | ✅ Shows `✖ experimentalDocgenServer on (Vue needs it for the docs tools)`. Installs `@storybook/addon-mcp@10.6.0` (11 packages added). **Registers it in the quoted-key config** ([init.ts:300](../../cli/init.ts#L300)) and **turns the flag on, in the config's own quoting style** ([init.ts:314](../../cli/init.ts#L314)). Ends with "Restart Storybook… then run: storysync list". | None |
| 6 | Running-Storybook warning | ⚠️ Warned about the Storybooks on 6007-6009, which run from *other* folders. Reworded during the test to "If one is this project's, stop it…" ([init.ts:339](../../cli/init.ts#L339)) | None |
| 7 | `storysync list` | ✅ 48 components, first time | None |
| 8 | `map --components Button,Tag,Badge` | ✅ Same variants as before. **New: the props that aren't variants, and why.** See finding N1. | None now |
| 9 | `snap` on the same three | ✅ 14/14 variants measured | None |

The diagnosis for missing docs tools ([init.ts:379](../../cli/init.ts#L379), shown by [index.ts:121](../../cli/index.ts#L121)) wasn't triggered, because `init` had already fixed the cause. It is covered by unit tests: a Vue config without the flag, addon-mcp 0.7 without `componentsManifest`, a config with everything on, a Storybook that's too old, and a folder with no `.storybook/`.

## Result

**Phase 1's acceptance criterion is met.** From a fresh clone: no hand edits. The one change the library needed (the Vue flag) was made by `init` after asking, and every check said what it found and why.

## Since last run

| | First field test | After Phase 1 |
|---|---|---|
| Manual interventions to get components | 4 | **0** (`init` adds the flag after asking) |
| Tokens, auto-detect | ❌ "No tokens found" | ✅ 331 colours, with the reason |
| Tokens, `--source tailwind` | ❌ "No tokens found" | ✅ 328 colours from `@theme` |
| "Detected:" label with `--source` | ❌ Wrong source named | ✅ "Source: … (from --source)" |
| Uncategorized tokens | 13+ raw lines | Grouped by prefix, with the naming rule |
| `init` with quoted keys | ❌ "Couldn't locate `addons: [`" | ✅ Registered |
| Vue flag | Found by reading compiled source | ✅ Checked and added by `init` |
| Addon version | Mismatched after install | ✅ Matched (and chosen from the lockfile when it's ahead) |
| Missing docs tools message | ❌ "…upgrade Storybook" (wrong) | ✅ Names the missing flag; upgrade only when too old |
| Props that aren't variants | Silent | ✅ Listed, with the reason |
| `--storybook` | Required on every command | Defaults to `http://localhost:6006`, and says so |

## Findings

| # | Finding | Links to |
|---|---|---|
| **N1** | **Named union types hide most missing variants.** Button's `severity` (`ButtonSeverity`), `variant` (`ButtonVariant`); Badge's `type`, `severity`, `size`; Tag's `severity`, `size`, `shape`. Vue's docs give the type's *name*, not its members, so Storysync can't see `'primary' \| 'danger' \| …`. This, not free-text props, is why Badge has no variants. | **New problem, proposed as A11.** Plan 3.4 should cover it: resolve named unions from the component's types (via vue-component-meta's schema or the source), with `argTypes.options` as the fallback. |
| N2 | **addon-mcp 10.6 turns `componentsManifest` on by itself.** For Vue only `experimentalDocgenServer` is needed. The first field test added both; one was redundant. | ADR 0003's Vue profile: corrected |
| N3 | The running-Storybook check can't tell which project a server belongs to | Reworded. A real check (the server's working folder) is for plan 2.2 `doctor`. |
| N4 | 23 tests fail on Windows before and after Phase 1 (line endings in the skill files, Bash-based action tests). None are caused by Phase 1. | Plan 5.2 |

## Changes left in the target repo

Only in the worktree `C:\Personal\projects\vue-component-library-p1`: `package.json`, `package-lock.json`, `.storybook/main.ts`, all written by `init`. Remove the worktree with `git worktree remove ../vue-component-library-p1 --force` from the main library.
