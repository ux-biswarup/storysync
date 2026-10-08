# Spike S8b: S8 with a guided procedure

**Date:** 2026-10-07
**Question:** Do S8's failures go away when the procedure tells Claude what S8 lacked: a mandatory reuse check, named decisions for the designer, sizing and line heights, typed completion? Or must Storysync do some of it itself? ([S8 note](2026-10-07-s8-component-generation.md))
**Code:** [spikes/s8b-guided-generation/](../../spikes/s8b-guided-generation/)

## What changed from S8

Same design (MetricTile, Figma `33:38`), same library, a fresh worktree, the same model (Sonnet). Changes:

| S8 finding | S8b change |
|---|---|
| R3 duplicated `Card` (kpi) | Step 2 of the role: a reuse check before any code, searching components' **props and docs, not only ones that look alike**, and asking the designer if anything overlaps |
| R4 asked nothing | Step 3 names the decisions that must be asked: fixed vs fill sizes, and each value with no exact token |
| R2 sizing lost | Step 1: note sizing and line height for every layer; step 4: match them |
| R7 fragile completion | Ends with the typed `storysync_submit_result` tool |
| R6 policy | `localhost` and Claude Code's temp folder allowed; `cd` outside the worktree denied; the worktree's processes stopped at the end |

The scripted designer chose "new component" if asked about reuse (so generation could be measured), "keep fixed" for sizes, and "keep exact" for token gaps. Claude's recommendation was logged for each question.

## Results

| | S8 | **S8b** |
|---|---|---|
| Questions asked before coding | 0 | **3** |
| Found the existing `Card` (kpi) | ❌ | **❌** |
| Fidelity vs Figma | 91.3% (126/138) | **95.7% (132/138)** ✅ above the 95% threshold |
| Width | ❌ hugged content | ✅ 240/200px, as the designer chose |
| Height (line height) | ❌ 5-11px taller | ❌ unchanged |
| Type check | ✅ | ✅ |
| Component's tests | ✅ (whole suite run twice) | ✅ 10/10 (component only, as asked) |
| Folder naming | `metric-tile` (doc wording) | `metrictile` (matches existing folders) |
| Completion | Text parsing, 2 extra turns | Typed result, 1 turn, no nudge |
| Denied actions | 2 (policy too strict) | 0 |
| Processes left running | 2 Storybooks | 0 started |
| Time / cost | 19 min / $3.32 | **10 min / $1.93** |

**Questions Claude asked** (recommendation → scripted answer):

1. *"The design shows fixed widths … keep those, or stretch to fill the container?"* Recommended **fill the container** → designer chose **keep fixed**
2. *"28px … our token set jumps from 24 to 32px. Which should we use?"* Recommended **keep exact 28px** → keep exact
3. *"6px horizontal padding … tokens have 4 and 8px."* Recommended **keep exact 6px** → keep exact

Clear, non-technical questions with useful recommendations: these could go straight into a UI as buttons.

## Findings

| # | Finding | What Storysync must do |
|---|---|---|
| **B1** | **Instructions alone don't make the reuse check work.** Despite "read props and docs, not only ones that look alike", Claude's whole search was one file-name match (`Glob src/components/metric*`), plus reading Tag for the chip. `Card.vue` contains "kpi" and "metric" many times. | **Storysync does the reuse check itself, deterministically**, and passes the candidates in. For example, a `storysync_find_similar_components` tool that searches every component's docs, props and story names for the design's concepts (here: metric, KPI, trend, figure) and its structure. Claude and the designer then judge the candidates. Plan 6.2b. |
| **B2** | **Named decisions work.** All three required questions were asked, in plain language, with sensible recommendations, before any code. | Keep the "must ask" list in the procedure, and grow it from experience. |
| **B3** | **Sizing intent is fixed by asking.** Width went from 0/6 to 6/6 once the designer's answer was applied. | Make sizing a standard question whenever a design has fixed sizes. |
| **B4** | **"Auto" line height isn't carried over.** Figma reports the text's line height as "auto", which isn't a number. Claude didn't set line heights, and every height is still 5-11px off. | The **design reader resolves "auto" to the font's real line height** (Inter ≈ 1.21 × font size) and passes a number in the change set. Plan 6.3. |
| **B5** | **Typed completion and the stricter role cut cost and time** (no runs of the whole suite, no follow-up turns): $1.93 and 10 min, against $3.32 and 19 min. | Keep. |
| **B6** | **Personal memory affects results.** Claude read `token-gaps.md` from the user's own Claude Code memory for this library. | Results can differ between users. Note it in onboarding, and consider running tasks with a known, minimal context. |
| **B7** | **Cleanup by matching command lines is unreliable.** It missed an S8 Storybook started under another folder name, and probably ended the runner's own parent shell (exit 255 after a successful run). | The runner records the PIDs it and Claude start, and stops exactly those (ADR 0006, amendment 7). |

## Conclusion

**With a guided procedure, generation meets the fidelity bar (95.7%), asks the right questions, and is faster and cheaper.** Two gaps are left. Neither can be fixed by prompting alone, and both belong in Storysync's own code: **finding existing components (B1)** and **turning "auto" line heights into numbers (B4)**. With both done, the S8 design would most likely end as "use Card (kpi)", or, for a truly new component, near-100% fidelity.

## Left in place

- Generated code in the worktree `C:\Personal\projects\vue-component-library-s8b` (remove with `git worktree remove ../vue-component-library-s8b --force` from the main library)
- The run's raw output in `spikes/s8b-guided-generation/results/` (gitignored). S8's raw `fidelity.json` was overwritten by S8b's first measurement; S8's numbers are kept in its research note, and `measure.mjs` now takes `SPIKE_OUT`.
