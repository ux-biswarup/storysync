# 0010. Support components drawn from scratch and components built from the library

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal
**Answers:** Q3

## Context

Figma → Storybook turns a designer's component into code ([0006](0006-figma-to-storybook-full-scope.md)). A Figma component can be made two ways:

- **From the library:** made from instances of existing Figma components (Button, Tag, Avatar…) and existing variables. Each piece maps to a known code component, so generating code is mostly composition, and very reliable.
- **From scratch:** frames, text and shapes with raw values. Nothing maps to code directly, so the generator has to work out which existing tokens and components the design means.

## Decision

Support **both**. Designers aren't restricted in how they draw.

## Options considered

| Option | For | Against |
|---|---|---|
| Library-based only | Most reliable code; reuse guaranteed | Limits designers; new primitives couldn't come from Figma |
| **Both** | No restrictions on designers; new primitives possible | From-scratch designs need extra work to produce reusable code |

## Consequences

The design reader must handle both, and treat them differently:

| | From the library | From scratch |
|---|---|---|
| **Components** | Map instances to code components via Figma Code Connect (or by name), and compose them | Look for structures that match existing components (a frame that looks like a Button) and suggest reusing them |
| **Values** | Already bound to variables, so they map to tokens | Match raw values to the nearest token (colour, spacing, radius, type). Values with no close token are shown in the UI to approve as **new tokens** or snap to an existing one. Nothing raw is hard-coded silently. |
| **Reliability** | High | Lower; relies more on the preview, the approval step and reverse `verify` |

- The UI should tell designers which way their component was built, and how much of it maps to existing tokens and components (for example "92% of values matched tokens; 2 new colours need approval").
- The "reuses existing tokens and components" check in the [0007](0007-success-measure-layman-pushes-component.md) checklist still applies to from-scratch components. Approved new tokens count as tokens.
- Code Connect mappings for the library's Figma components become valuable. Setting them up should be part of onboarding.
