# 0008. v1 scope: Vue 3 and React, local Storybook, CSS and Tailwind v4 tokens, Windows and macOS

**Status:** Proposed (analysis and recommendation; awaiting confirmation)
**Date:** 2026-10-07
**Answers:** P4

## Context

P4 asked what v1 supports. The decisions so far change the answer:

- **The UI runs locally** ([0005](0005-run-ui-locally-first.md)).
- **Figma → Storybook writes code** ([0006](0006-figma-to-storybook-full-scope.md)), so it **needs the repo checked out locally** anyway, with a local Storybook running.
- **Success is measured on generated component code** ([0007](0007-success-measure-layman-pushes-component.md)). Each framework multiplies the work: code conventions, styling, stories and tests all differ.
- **The first real user is a Vue 3 + PrimeVue + Tailwind v4 library**, on Windows, with an Enterprise Figma plan ([field test](../../research/2026-10-07-vue-library-field-test.md)).

## Recommendation

| Area | v1 | Later | Why |
|---|---|---|---|
| **Frameworks** | **Vue 3** (`vue3-vite`) as primary; **React** (`react-vite`) kept working | Svelte, Next.js: keep what works today, untested in v1. Angular, Web Components: after v1. | Vue is the real user. React already works and is the largest market. Code generation per framework is expensive, so start with one done well. |
| **Storybook source** | **Local dev server with addon-mcp**, set up automatically by the wizard | Published and SSO Storybooks: with hosting | Local is required for writing code; published Storybooks matter mainly for hosted PM views |
| **Tokens** | CSS custom properties, Tailwind v4 `@theme`, **custom categorization rules**, a PrimeVue/Aura preset | Tailwind v3 configs and theme files: keep what works; no new work | Matches the first user; without rules most of their tokens are lost |
| **Figma** | Full seat; variables via Figma MCP | REST variables (Enterprise) for PM views | Figma MCP is the agreed write path |
| **AI** | **Claude Code only** ([0009](0009-claude-code-only.md)) | Cursor, Codex and other MCP clients | One runtime to make reliable |
| **OS** | Windows and macOS | Linux beyond CI | The first users are on Windows; designers often use macOS |
| **Package managers** | npm and pnpm | yarn, bun | Field test used npm; the repo uses pnpm |

## Consequences

- **Phase 3 shrinks for v1.** The static and SSO Storybook source (ADR 0002) moves to "with hosting". Token rules (3.3) and string props with known values (3.4) stay in v1.
- **The `vue3-vite` framework profile and a Vue example project** become v1 must-haves, along with Windows in CI.
- If confirmed, this becomes `Accepted` and the plan's Phase 3 and 5 are re-scoped.
