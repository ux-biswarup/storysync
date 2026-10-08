# 0001. Record architecture decisions as ADRs

**Status:** Accepted
**Date:** 2026-10-07
**Deciders:** Biswarup Mondal

## Context

Storysync is changing shape: new adapters, a config file, possibly a Figma plugin and a UI. Many of these choices are hard to reverse, and the reasons behind today's design (why the agent writes to Figma, why checksums exist) currently live only in the README's prose and in commit history.

## Decision

Record every significant architecture decision as a numbered file in `docs/architecture/adr/`, using [template.md](template.md). Product and UX decisions use the same format in `docs/product/decisions/` and `docs/ux/decisions/`.

## Consequences

- New contributors can see why things are the way they are.
- Changing a decision is explicit: a new record supersedes the old one.
- It costs a few minutes per decision. The `record-decision` skill keeps that cost low.
