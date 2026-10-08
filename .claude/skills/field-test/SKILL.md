---
name: field-test
description: Run Storysync against a real Storybook project (not the bundled example) and write up what worked, what failed and why, as a dated research note. Use when the user asks to "try storysync on <project>", "test it against our Storybook", check whether a framework works, or rerun the field test after a release or a plan phase.
---

# Field test Storysync against a real Storybook

The goal is **evidence**: an honest, step-by-step record of a real user's path, with root causes. The first one is `docs/research/2026-10-07-vue-library-field-test.md`. Match its format.

## Before you start

1. **Build the CLI from this repo**: `pnpm install && pnpm build`. Run it as `node <storysync-repo>/dist/cli/index.js`, so you're testing this commit, not the npm release. Record the commit (`git rev-parse --short HEAD`) and the version.
2. **Ask the user** for the target: a Storybook URL, a path to its repo, or both. Don't modify the target repo without the user's explicit go-ahead. If they agree, record every file you change.
3. Record the environment: OS, Node version, package manager.

## Steps

Run each step even after a failure (work around it and note the workaround), so one test shows every problem, not just the first one.

| # | Check | How |
|---|---|---|
| 1 | Storybook reachable | `curl -s -m 10 -o /dev/null -w "%{http_code}" <url>/`. A 3xx to a login page means it's behind auth. |
| 2 | Static or dev server | `<url>/index.json` → count entries. `<url>/mcp`: send a POST `initialize` request. **Don't GET `/mcp`: it's a stream and hangs `curl`.** Always use `-m`. |
| 3 | Framework and versions | Read the target's `package.json`, `.storybook/main.*`, and `node_modules/storybook/package.json`. Note how `main.*` is written (quoted keys, `defineMain`, CJS). |
| 4 | Tokens: auto-detect | `storysync tokens` in the target repo |
| 5 | Tokens: each source | `--source css`, `--source tailwind`, `--source theme`. Note counts per category and every "Uncategorized" prefix. |
| 6 | `init` | Only with permission. Pipe answers with `printf 'y\ny\n' \| …`, since it reads prompts from stdin. Then `git diff --stat` in the target. |
| 7 | MCP tools | `storysync list --storybook <url>`. If the docs tools are missing, list the tools the server exposes with the MCP SDK client (a small `.mjs` script run from this repo, so it can import `@modelcontextprotocol/sdk`). Find the real cause in `@storybook/addon-mcp`'s `getManifestStatus` and the framework preset's `experimental_manifests`. |
| 8 | `map` | `--components` with 3 representative components (one with enum props, one simple, one complex). Note skipped props. |
| 9 | `snap` | Same components, `--out` to a scratch folder, not the target repo |
| 10 | Figma (optional) | With the Figma MCP: `whoami` (seat), and `get_metadata` on the target file |

If you start a second Storybook to test config changes, use a free port and stop it afterwards. On Windows, stopping the shell isn't enough: find the PID with `netstat -ano` and use `taskkill //PID <pid> //T //F`. Never stop a Storybook the user started themselves.

## Write the note

`docs/research/YYYY-MM-DD-<target>-field-test.md`, with these sections:

- **Question**, **Target project** (table), **Environment**
- **What happened, step by step**: a table with #, Step, Result (✅ ⚠️ ❌), Fix needed. Link the root cause to code as `cli/file.ts#Lnn` where it's in Storysync.
- **Result**: how many manual interventions it took, and where a typical user would have stopped
- **Changes left in the target repo**: every file, and how to undo them
- **What this tells us**: link each finding to an architecture problem ID (A1-A10), a plan item, or a new problem

Then:
1. Add a row to `docs/research/README.md`.
2. If it found a new problem, propose it to the user as a new A-number for `docs/architecture/current-state.md`, and as a plan item. Don't add these without asking.
3. If it's a rerun after a plan phase, compare with the previous note in a short "Since last run" table.

## Rules

- Report what happened, including what worked. Don't soften failures or overstate them.
- No secrets in the note: no cookies, tokens or internal credentials. Internal URLs are fine if the user provided them.
