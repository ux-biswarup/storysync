# 0003. Describe framework requirements as data profiles

**Status:** Accepted
**Deciders:** Biswarup Mondal (approved by starting Phase 2, 2026-10-08)
**Date:** 2026-10-07
**Solves:** A2

## Context

The README lists React, Next.js and SvelteKit as supported ([README.md:590](../../../README.md#L590)). In the [Vue field test](../../research/2026-10-07-vue-library-field-test.md), Vue worked once two settings were added:

- `features.componentsManifest: true`, which addon-mcp needs before it registers its docs tools. *Correction from the [Phase 1 rerun](../../research/2026-10-07-vue-library-phase1-field-test.md): addon-mcp 10.6 and later turns this on itself, so it only matters with addon-mcp 0.7.*
- `features.experimentalDocgenServer: true`, without which `@storybook/vue3-vite` returns no component manifest. This is the flag Vue actually needs.

Nothing in Storysync knew this. The error message blamed the Storybook version ("require Storybook 10.1+ … upgrade") even though the user was on 10.6.

## Decision

Add one profile per framework, as data:

```ts
interface FrameworkProfile {
  id: "react-vite" | "nextjs-vite" | "vue3-vite" | "sveltekit" | "angular" | "web-components-vite";
  minStorybook: string;
  requiredFeatures: Record<string, boolean>;   // e.g. { componentsManifest: true, experimentalDocgenServer: true }
  docgen: "react-docgen" | "vue-component-meta" | "svelte" | "compodoc" | "cem" | "none";
  propQuality: "full" | "partial" | "none";
  knownIssues: { id: string; message: string; fix?: string }[];
}
```

The wizard applies `requiredFeatures` through the `ConfigEditor`. `doctor` compares the real config with the profile, and error messages say exactly what's missing.

## Options considered

| Option | For | Against |
|---|---|---|
| Document per-framework steps in the README | Cheap | Users still edit by hand; errors stay wrong |
| `if (framework === "vue")` branches in code | Quick | Spreads across modules; hard to test as a matrix |
| **Data profiles** | One place per framework; testable; drives `doctor`, the wizard and the docs | Profiles must be kept up to date as Storybook evolves |

## Consequences

- Adding a framework means adding a profile and an example project to the CI matrix, not changing code across modules.
- The README's support table can be generated from the profiles.
- We need an example Storybook per framework in CI to keep the profiles honest.

## Follow-up

- Write the `vue3-vite` profile from the field test.
- Spike S3: Angular (compodoc) and Web Components (custom elements manifest), to fill in their profiles' `propQuality`.
