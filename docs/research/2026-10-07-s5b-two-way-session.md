# Spike S5b: a two-way session with headless Claude Code

**Date:** 2026-10-07
**Question:** Can the Storysync UI hold a conversation with headless Claude Code: answer Claude's questions, send follow-up messages, and keep context? And do the fixes for S5's findings F2 and F4 work? ([S5 note](2026-10-07-s5-headless-claude-code.md), [ADR 0006](../architecture/adr/0006-ui-orchestration-architecture.md))
**Code:** [spikes/s5b-two-way-session/](../../spikes/s5b-two-way-session/)
**Environment:** same as S5 (Windows 11, Claude Code 2.1.177, Sonnet, Vue Storybook on `:6008`)

## Setup

One Claude Code process for the whole conversation:

```
claude -p --input-format stream-json --output-format stream-json --verbose --model sonnet
       --append-system-prompt "<Storysync's role>"
       --mcp-config results/mcp-config.json
       --permission-prompt-tool mcp__storysync__approve
       --disallowedTools Bash,Write,Edit
```

The runner sends each user message as a JSON line on stdin. It sends the next one when it receives the previous turn's `result` event, and closes stdin after the last turn. The scripted "user" picks Tag when asked.

## Results

| # | Check | Result |
|---|---|---|
| A | **Claude's question tool answered by the UI.** Claude called `AskUserQuestion` (Button, Tag, Badge). The approval tool returned `allow` with `updatedInput.answers` filled in. | ✅ Claude received "Tag" and carried on: *"Your questions have been answered … ="Tag""* |
| B | **Several turns, one session.** 3 user turns, one process, one `session_id` | ✅ Context kept: turn 3 answered "Badge", from turn 2 |
| C | **Plain-text question, answered next turn.** Turn 2 ended *"Does that look right to you? Let me know and I'll proceed."*, and turn 3's reply continued from it. | ✅ |
| D | **Role as system context** (`--append-system-prompt`) | ✅ No prompt-injection warning. In S5, without it, Claude flagged the task. |
| E | **`--disallowedTools Bash,Write,Edit`** | ✅ Bash wasn't in the tool list. Asked to run `echo hi`, Claude said it had no shell tool. |

**Cost and time:** 48 s in total. Cumulative cost: $0.20 after turn 1, $0.25 after turn 2, $0.26 after turn 3. Most of the cost is the first turn, which loads the system prompt and tools. Follow-up turns are cheap.

## Findings

| # | Finding | Effect on the design |
|---|---|---|
| G1 | **Questions have two working channels.** Structured (`AskUserQuestion` answered through the permission tool's `updatedInput.answers`) and free text (a question at the end of a turn, answered by the next message). | The UI supports both: structured questions become buttons; free-text questions get a reply box. |
| G2 | **One session per task is much cheaper than one process per message.** Follow-up turns cost a few cents, against $0.20 for the first. | The runner keeps one Claude Code process per UI task (e.g. "push Badge"), and ends it when the task ends. |
| G3 | **Turn boundaries are clear.** Each turn ends with a `result` event, and a new `init` event arrives with each user message. | The UI can show "Claude is working" and "waiting for you" states reliably. |
| G4 | **Unrelated connectors load too.** The user's other claude.ai connectors (e.g. GitLab) connect at startup ("Some MCP servers are still connecting: claude.ai GitLab"), costing time and tool-search turns. | Look at limiting servers per task. `--strict-mcp-config` would also drop the claude.ai Figma connector, so the Figma plugin would have to be configured instead. To test in Phase 4. |

## Conclusion

**The two-way channel works.** With S5, every technical question behind ADR 0006 is answered. The UI can drive the user's own Claude Code; add Storybook, Figma and Storysync tools; approve or reject each write; answer Claude's questions; and hold a multi-turn conversation per task.
