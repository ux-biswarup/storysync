# 0002. Read Storybook through source adapters (MCP and static)

**Status:** Proposed
**Date:** 2026-10-07
**Solves:** A1, A10

## Context

Storysync gets its component list and prop types only through `@storybook/addon-mcp`'s docs tools ([storybook.ts:249-277](../../../cli/storybook.ts#L249-L277)). That means users must:

- add a dependency to their Storybook repo, register it, and (for Vue) turn on two feature flags
- run the **dev server**, because static builds don't serve `/mcp`
- have an unauthenticated URL

In the [Vue field test](../../research/2026-10-07-vue-library-field-test.md), the team's published Storybook (a static build behind SSO) couldn't be used at all, and getting the local one working took four manual fixes.

But rendering (`snap`) already uses only plain HTTP to `iframe.html`. MCP is needed for the catalogue and the props, nothing else. The docs tools' output is also markdown, which `storybook.ts` parses, so it breaks when addon-mcp changes its wording.

## Decision

Introduce a `StorybookSource` interface with two adapters:

1. **McpSource**: today's behaviour.
2. **StaticSource**: the catalogue comes from `index.json`, and the prop types (`argTypes`, including enum `options`) are read from the Storybook preview runtime inside `iframe.html`, using the Chromium that `snap` already launches. Works on dev servers and published builds alike. It takes auth headers or cookies from the environment for protected Storybooks.

`source: "auto"` tries MCP first, then static. Each source reports its `capabilities()`, so users can see when prop data is weaker.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep MCP only | No new code | Adoption barrier stays; published Storybooks excluded |
| Static only | One path; no addon at all | Loses MCP's richer docgen where it exists; breaks current users |
| **Both, behind an interface** | No repo changes for most users; MCP when richer data is needed | Two adapters to maintain and test |
| Parse story source files directly | No running Storybook | Re-implements docgen per framework; contradicts "measure, don't guess" |

## Consequences

- Most users can start with just a URL. The addon becomes optional.
- We depend on the preview runtime's shape, which is internal to Storybook, so it needs contract tests across Storybook versions.
- The auth adapter must never write secrets to disk or include them in JSON output.

## Follow-up

- **Spike S1:** on a static build, for React and Vue, check whether the preview runtime exposes `argTypes` with enum `options`. What it finds decides whether StaticSource can be the default.
- **Spike S2:** check whether the SSO-protected 4flow Storybook can be reached with a session cookie, and whether the session expires mid-run.
