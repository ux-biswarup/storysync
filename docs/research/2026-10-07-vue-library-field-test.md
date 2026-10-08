# Field test: Vue component library

**Date:** 2026-10-07
**Storysync version:** 0.3.0, built from `main` at `9f8299a`
**Target:** 4flow's internal Vue component library (`vue-component-library`), a production design system with 48 components and 1005 stories
**Environment:** Windows 11, Node 25.9, npm

## Question

Can a team with an existing, real-world Storybook get from "never heard of Storysync" to "components measured and ready to push to Figma"? And what goes wrong on the way?

## Target project

| | |
|---|---|
| Framework | `@storybook/vue3-vite` |
| Storybook | 10.5.5 in `node_modules` (lockfile pinned 10.6.0) |
| Styling | Tailwind v4 (CSS-first, with a stub `tailwind.config.ts`) and PrimeVue Aura theme variables |
| Token files | `src/styles/tokens.css` (`:root`), `src/styles/tailwind.css` (`@theme`) |
| Config style | `.storybook/main.ts` with quoted keys (`"addons": [`) |
| Published Storybook | `https://ui.platform.4flow-software.com/latest/`, a static build behind SSO |

## What happened, step by step

| # | Step | Result | Fix needed |
|---|---|---|---|
| 1 | Point Storysync at the published Storybook | ❌ Every request, `/mcp` included, is redirected to the SSO login. Static builds don't serve `/mcp` anyway. | Clone the repo and run Storybook locally |
| 2 | Point Storysync at the local dev server (`:6007`) | ❌ `/mcp` returns 404: `@storybook/addon-mcp` isn't installed | Install the addon |
| 3 | `storysync tokens` (auto-detect) | ❌ "No tokens found". Detection picked the empty Tailwind v4 config stub ([cli/tokens.ts:88](../../cli/tokens.ts#L88) checks for a config first). | Pass `--source css` |
| 4 | `storysync tokens --source css` | ⚠️ 340 colours found. Radii, font sizes and shadows are reported as "uncategorized" because their names (`--aura-primitive-border-radius-*`, `--p-*`) don't match Storysync's prefixes. Output still says "Detected: tailwind (tailwind.config.ts)". | None available, so those tokens are lost |
| 5 | `storysync tokens --source tailwind` | ❌ "No tokens found", although `src/styles/tailwind.css` has `@theme` blocks. `@theme` is only read when no Tailwind config exists. | None |
| 6 | `storysync init` | ⚠️ Installed `@storybook/addon-mcp@^0.7.0`, then failed to register it: "Couldn't locate `addons: [`". The regex at [cli/init.ts:251](../../cli/init.ts#L251) doesn't match quoted keys. | Edit `main.ts` by hand |
| 7 | `init`'s `npm install` | ⚠️ Changed 106 packages and brought Storybook from 10.5.5 to 10.6.0, the version the lockfile already pinned. The addon version had been chosen from 10.5.5 before the install, so the two no longer matched. EPERM warnings appeared because Storybook was running. | Reinstall `@storybook/addon-mcp@^10.6` |
| 8 | `storysync list` | ❌ "Storybook MCP is missing the docs tools … require Storybook 10.1+ … upgrade". **This is the wrong diagnosis:** Storybook was already 10.5/10.6. | See next row |
| 9 | Diagnose by reading addon-mcp's source | The docs tools only register when `features.componentsManifest` is on **and** the framework returns a manifest. `@storybook/vue3-vite` only returns one when `features.experimentalDocgenServer` is `true`. | Add both flags to `main.ts` |
| 10 | `storysync list` | ✅ 48 components | |
| 11 | `storysync map --components Button,Tag,Badge` | ✅ Button 144 combinations, Tag 8. ⚠️ Badge has "no variants" and Button lost `severity`: string-typed props are skipped with no message. | None |
| 12 | `storysync snap` on the same three | ✅ 14/14 variants measured, using the installed Chrome | |
| 13 | Figma MCP: open the target file | ✅ Full seat, file readable | |

## Result

It works for Vue, but only after four manual interventions that require reading Storybook's and addon-mcp's compiled source:

1. Run Storybook locally instead of using the published build
2. Register the addon in `main.ts` by hand
3. Correct the addon version after `init`'s own install upgraded Storybook
4. Turn on two feature flags that nothing documents for Storysync

A typical user would have stopped at step 3, 6 or 8.

## Changes left in the target repo

- `package.json` and `package-lock.json`: `@storybook/addon-mcp@^10.6.1`
- `.storybook/main.ts`: the addon entry, `features.componentsManifest`, `features.experimentalDocgenServer`

`experimentalDocgenServer` changes how that Storybook generates prop docs. It needs checking before it's committed.

## What this tells us

- **Setup, not measurement, is the bottleneck.** Once connected, `map` and `snap` worked first time on a large production library.
- **Framework support is a configuration problem, not a capability problem**, at least for Vue. See [ADR 0003](../architecture/adr/0003-framework-profiles.md).
- **Errors must diagnose, not guess.** The step 8 message sent us towards an upgrade we didn't need.
- **Teams already have a published Storybook.** Requiring a local dev server plus repo changes is the biggest adoption barrier. See [ADR 0002](../architecture/adr/0002-storybook-source-adapters.md).
- **Token extraction assumes naming conventions** that design systems built on component libraries (PrimeVue, Vuetify, MUI) don't follow.
