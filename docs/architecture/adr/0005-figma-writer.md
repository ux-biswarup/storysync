# 0005. Put Figma writing behind a `FigmaWriter` interface; single-source the skills

**Status:** Proposed. Product decision [0003](../../product/decisions/0003-ui-orchestrating-mcp-not-figma-plugin.md) settled P3: the writer is the agent through Figma MCP. **PluginWriter is rejected.**
**Date:** 2026-10-07
**Solves:** A7

## Context

Writing to Figma is done by an AI agent following a skill file. The Claude Code skill is about 10,000 words, and there are three near-copies (`claude-code.md`, `codex.md`, `cursor.mdc`, about 27,000 words in total). A single step of the push command ([commands/storysync-push.md](../../../commands/storysync-push.md)) is about 1,000 words of rules about Figma's Plugin API: stroke alignment, layer order, 50k/20kb limits, how to retry.

That is effectively a program written in prose, run by a model. It works (the example scores 100%), and the checksummed readback plus `verify` stop the agent from making results up. But it is:

- **expensive and slow:** the agent has to read the instructions every time, and builds each set in parts
- **non-deterministic:** the same input can produce different files
- **hard to change:** three copies must be edited in step, with nothing to catch drift
- **tied to AI clients:** a designer without Claude, Cursor or Codex can't push at all

## Decision

1. Define a `FigmaWriter` interface (`writeTokens`, `writeComponentSet`, `readBack`) with the readback contract that `verify` already uses.
2. **Single-source the skills.** Keep one source for the procedure and generate the three client files at build time. Add a test that fails if the generated files are stale.
3. **Move the Figma Plugin API code out of prose into versioned templates** that ship in the package. The agent fills in the data and runs the template; it doesn't assemble the logic itself.
4. **The writer is AgentWriter**: the agent writes through Figma MCP, slimmed down by steps 2-3, and run by headless Claude Code from the UI ([ADR 0006](0006-ui-orchestration-architecture.md)), and by Claude Code, Cursor or Codex directly for engineers. A Figma plugin writer was considered and rejected in product decision [0003](../../product/decisions/0003-ui-orchestrating-mcp-not-figma-plugin.md).

## Options considered

| Option | For | Against |
|---|---|---|
| Keep as is | Works today | All the costs above |
| **Agent + code templates** | Smaller skill, deterministic plugin code, still works in every MCP client | Still needs an AI client and its token budget |
| **Figma plugin** | Deterministic; no AI needed; fast; can have a real UI inside Figma | Needs publishing to the Figma Community (or private org publishing); a new codebase to maintain; data has to get from the CLI into the plugin (file upload, paste, or a local server) |
| Figma REST API | No plugin | Can't create components; variables only on Enterprise |

## Consequences

- Writing stays non-deterministic. `verify` and the checksummed readback stay essential, and the code templates (step 3) are the main way to make writes predictable.
- The `FigmaWriter` interface still earns its place: the orchestrator and the AI clients both use it.

## Follow-up

- Spike S4: measure tokens used and wall-clock time for one push of the example project today, as a baseline for comparison.
