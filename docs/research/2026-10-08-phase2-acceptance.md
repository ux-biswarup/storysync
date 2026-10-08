# Phase 2 acceptance: `npx storysync`, then `npx storysync doctor`

**Date:** 2026-10-08
**Storysync version:** 0.3.0 at `e2008af` plus the uncommitted Phase 2 changes ([plan, Phase 2](../plans/implementation-plan.md#phase-2-set-up-once))
**Environment:** Windows 11, Node 25.9, Claude Code 2.1.177

## Question

Phase 2's acceptance test: on a fresh copy of the example and of the Vue library, does `npx storysync` (the wizard), followed by `npx storysync doctor`, end with every check passing and **no hand edits**?

## Runs

### A. The example project (React)

A fresh copy of `examples/storybook-vite` (tracked files only), `pnpm install --frozen-lockfile`.

| Step | Result |
|---|---|
| 1 Storybook | ✅ Already set up: addon-mcp 10.6.0 installed and registered. Nothing to change. |
| 2 Settings | ✅ No design tokens in the example, said so. Wrote `storysync.config.json`. |
| 3 AI client | ✅ Wrote the Claude Code skill and commands, **registered Storybook MCP in Claude Code by itself**, and found Figma there |
| 4 Check | ✖ Only "Storybook running": nothing at :6006, with "Last step: start Storybook… then check again" |
| After `pnpm storybook` | ✅ **`doctor`: Ready. 11 ok, 0 warnings, 0 failed** (2 info: no tokens; Figma checked at push) |

### B. The Vue library

A fresh detached worktree of the 4flow Vue component library, `npm ci`. Answers: yes to every change, Storybook at `:6013`, tokens yes, the test Figma file, Claude Code.

| Step | Result |
|---|---|
| 1 Storybook | ✅ Installed `@storybook/addon-mcp@10.6.0`, registered it in the quoted-key config, turned on `experimentalDocgenServer` (from the Vue profile) |
| 2 Settings | ✅ Found tokens ("tailwind.config.ts has no theme…; reading :root"), took the Figma file key from the pasted URL, wrote the config |
| 3 AI client | ✅ Skill and commands written, MCP registered, Figma found. ⚠️ **See finding P1.** |
| 4 Check | ✖ Only "Storybook running": nothing at :6013 yet |
| After starting Storybook on :6013 | ✅ **`doctor`: Ready. 13 ok, 0 warnings, 0 failed** (2 info: the A11 limit; Figma at push). 48 components, 331 tokens, URL from `storysync.config.json`. |

## Result

**Phase 2's acceptance criterion is met** on both projects. The only step outside the wizard is starting Storybook, which the wizard says to do.

## Findings

| # | Finding | What was done |
|---|---|---|
| **P1** | **Claude Code keeps "local" MCP servers per git repository, and a worktree shares its main checkout's.** In run B, registering MCP in the worktree *replaced the user's own registration* for their main checkout (`:6007` → `:6013`). The first version of `registerMcp` also replaced a different entry without asking. | User's entry restored to `http://localhost:6007/mcp` (found in Claude Code's config backups). `registerMcp` now **never replaces a different storybook server**: it keeps it and reports both URLs. `setup` needs `--replace-mcp`, and the wizard asks, defaulting to no. Tests cover Claude Code, Cursor and Codex. |
| P2 | `doctor` warned about a project with no design tokens, but that isn't a problem: components still sync | Now informational |
| P3 | Stopping a Storybook doesn't always free its folder on Windows: background shells whose working directory was inside it held it open | Note for the UI runner (ADR 0006, amendment 7): track and stop the processes a task starts, including shells |

## Changes left behind

None. Both copies were deleted, the example's Claude Code registration was removed, and the user's registration was restored.
