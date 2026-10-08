# 0004. Add a project config file, `storysync.config.json`

**Status:** Accepted
**Deciders:** Biswarup Mondal (approved by starting Phase 2, 2026-10-08)
**Date:** 2026-10-07
**Solves:** A5, A6

## Context

Every component command needs `--storybook <url>`. Token detection picks the first match in a fixed order ([tokens.ts:87-101](../../../cli/tokens.ts#L87-L101)), and there is nowhere to say "my tokens are in this file" or "these variables are radii" once and have it remembered. In the [Vue field test](../../research/2026-10-07-vue-library-field-test.md), detection picked an empty Tailwind v4 stub, and radii, font sizes and shadows were dropped because of their names.

## Decision

Add `storysync.config.json` at the project root:

- **JSON with a published JSON Schema**, so editors give autocomplete and the wizard can write it safely
- Written by the wizard (`npx storysync`), read by every command and the GitHub Action
- Precedence: **flag > environment variable > config file > detection**. `doctor` prints which one supplied each value.
- Holds: Storybook URL, source and auth reference (never the secret itself), framework, token sources and categorization rules, component scope and caps, Figma file key

## Options considered

| Option | For | Against |
|---|---|---|
| Keep flags only | Simple | Repetitive and error-prone; nowhere to keep categorization rules |
| `storysync.config.ts` | Typed; can compute values | Needs a TS loader at runtime; harder for the wizard to write |
| `"storysync"` key in `package.json` | No new file | Crowds `package.json`; not every repo's Storybook lives beside it |
| **`storysync.config.json` + schema** | Easy for tools to read and write; validated | JSON has no comments (use the schema's descriptions instead) |

## Consequences

- Commands get shorter: `npx storysync snap` instead of a line of flags.
- The GitHub Action and local runs share one source of truth.
- The schema becomes a public contract that needs versioning.
