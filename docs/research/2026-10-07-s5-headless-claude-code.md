# Spike S5: driving headless Claude Code from a local server

**Date:** 2026-10-07
**Question:** Can Storysync's local UI server drive the user's Claude Code in headless mode, with Figma MCP, Storybook MCP and Storysync's own tools, route approvals to the UI, and stream progress? ([ADR 0006](../architecture/adr/0006-ui-orchestration-architecture.md), [plan 0.9](../plans/implementation-plan.md))
**Code:** [spikes/s5-headless-claude-code/](../../spikes/s5-headless-claude-code/)

## Environment

| | |
|---|---|
| OS | Windows 11 |
| Claude Code | 2.1.177, logged in with a claude.ai account (`apiKeySource: none`) |
| Model | Sonnet (`claude-sonnet-4-6`) via `--model sonnet` |
| Storybook | 4flow Vue library, `http://localhost:6008`, addon-mcp 10.6.1 |
| Figma | Test file `nge2jqPcZmYdtR6jbGmOis`, Full seat (Enterprise) |

## Setup

`run.mjs` stands in for the UI server. It spawns:

```
claude -p --output-format stream-json --verbose --model sonnet
       --mcp-config results/mcp-config.json          # adds storybook (HTTP) + storysync (stdio)
       --permission-prompt-tool mcp__storysync__approve
       --max-turns 30
```

The task prompt goes in on stdin. Storysync's MCP server forwards each permission request to the runner over HTTP, and the runner answers with a fixed policy, standing in for a user's clicks.

## Results

| # | Check | Result |
|---|---|---|
| 1 | Spawn headless Claude Code and parse its stream into progress events | ✅ init, text, tool use, tool result and final result events all arrive live |
| 2 | **User's Figma MCP available in headless mode, and `use_figma` writes** | ✅ Created frame `28:2` in the test file; later removed it |
| 3 | Add Storybook MCP and a custom MCP server for one run | ✅ `docs-list` returned the library; `storysync_list_components` returned 48 components |
| 4 | Route permission prompts to our own tool, so the UI decides | ✅ Allowed calls ran; a denied `Write` and a denied `use_figma` did not run; Claude reported each denial and didn't try another route |
| 5 | Works on Windows | ✅ |

**Runs:**

| Run | Turns | Time | Cost | Approvals |
|---|---|---|---|---|
| Write (read Storybook, whoami, write frame) | 12 | 51 s | $0.39 | 4 allowed |
| Deny + cleanup | 7 | 108 s | $0.21 | 2 allowed, 2 denied |
| Trivial ("reply ok") on the default model, Opus | 1 | 3 s | $0.23 | — |

The test frame was removed by the cleanup run, and an independent check confirmed the page was empty again.

## Findings

| # | Finding | Effect on ADR 0006 |
|---|---|---|
| F1 | **claude.ai connectors do load in headless mode**, on demand. They're missing from the startup tool list, and Claude finds them with ToolSearch. Claude used the claude.ai Figma connector (`mcp__claude_ai_Figma__*`), not the Figma plugin (`plugin:figma:figma`), although both were set up. | Prompts must not hard-code a Figma server name. `doctor` must detect which Figma server exists. |
| F2 | **Claude treated the stdin prompt as a possible prompt injection.** It opened with "You are running inside an automated test…", and Claude flagged it and tried to ask the user (`AskUserQuestion`) before continuing. | Give Storysync's role and the user's authority as system context (`--append-system-prompt`), and keep the stdin message as the user's actual request. |
| F3 | **Questions from Claude have no answer channel.** `AskUserQuestion` went through our approval, but in one-shot `-p` mode nobody can answer it ("The user did not answer the questions"). | The UI needs a way to answer: run Claude Code with streamed input (`--input-format stream-json`) for a two-way session, or disallow the tool and have Claude end with a structured question that the UI shows. **Follow-up spike S5b.** |
| F4 | **Some tool calls never reach the approval tool.** Claude Code auto-allows what it considers read-only (`echo hello` in Bash ran without asking). | Approvals cover writes, but they aren't a full sandbox. Also restrict tools per task (`--disallowedTools Bash,Write,Edit` for Figma pushes), and run code-writing tasks (Phase 6) on a separate branch or worktree. |
| F5 | **Model choice matters.** The default model in this setup is Opus with a 1M context: $0.23 for a one-word reply. Sonnet did the whole write flow for $0.39. Deferred tool loading (ToolSearch) and the mandatory `figma-use` skill add turns. | The runner always sets `--model`. Measure per-component cost in S4 and S8. |
| F6 | **MCP servers connect asynchronously.** All servers were `pending` at startup and ready by the time Claude needed them. | No change. Show "connecting…" in the UI. |
| F7 | **Denial messages reach Claude word for word.** The spike reused one message for every denial, so Claude was told "Shell commands are not allowed" about a Figma write. | The UI sends a specific reason with each rejection ("You rejected writing Button to Figma"). |

## Conclusion

**The architecture in ADR 0006 works.** A local server can drive the user's own Claude Code, with their login and Figma connector, add Storybook and Storysync tools, and keep writes behind an approval in its own UI. It needs four changes (F2, F3, F4, F7), and F3 needs a short follow-up spike.

## Follow-up

- **S5b:** a two-way session with `--input-format stream-json`: Claude asks a question, the UI answers, and the run continues.
- Update ADR 0006 with F1-F7, then accept it.
