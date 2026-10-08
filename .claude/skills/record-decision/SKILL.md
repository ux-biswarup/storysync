---
name: record-decision
description: Record an architecture, product or UX decision for Storysync as a numbered decision record in docs/. Use when the user takes or proposes a decision ("let's go with X", "we decided", "record this", "write an ADR"), answers one of the open product questions (P1-P8 in docs/product/open-questions.md), or accepts, rejects or supersedes an existing record.
---

# Record a decision

Decisions live in three logs that share one template ([docs/architecture/adr/template.md](../../../docs/architecture/adr/template.md)):

| Kind | Folder | Index to update |
|---|---|---|
| Architecture | `docs/architecture/adr/` | `docs/architecture/adr/README.md` |
| Product | `docs/product/decisions/` | `docs/product/decisions/README.md` |
| UX / UI | `docs/ux/decisions/` | `docs/ux/decisions/README.md` |

## Steps

1. **Pick the log.** Choose by what the decision is about, not who made it. "Which writer is the default" is product (P3); "how the writer interface looks" is architecture. If one decision has both sides, write one record per log and link them to each other.
2. **Find the next number**: the highest `NNNN-*.md` in that folder, plus one, padded to four digits.
3. **Name the file** `NNNN-short-kebab-title.md`. Title it in the imperative: "Use a Figma plugin as the default writer".
4. **Fill in the template.** It must have:
   - `Status` — `Proposed` unless the user says it is decided, then `Accepted`
   - `Date` — today, as an absolute date
   - `Deciders` — the people the user names. Never guess.
   - `Solves` / `Answers` — problem IDs (A1-A10 from `docs/architecture/current-state.md`) or product question IDs (P1-P8)
   - **Context with evidence**: link research notes, code as `path#Lnn`, or the conversation's facts. Don't invent evidence.
   - At least two options considered, including the one that was rejected
   - Consequences, including what becomes harder
5. **Update the folder's README index** with a new row.
6. **Update anything that pointed at the open question:**
   - Product: in `docs/product/open-questions.md`, mark the question `Decided → [NNNN](decisions/NNNN-….md)`
   - Check `docs/plans/implementation-plan.md` for items blocked by it, and update their "Depends on" or "Blocked by" columns
   - Check `docs/architecture/target-architecture.md` for sections marked with this question's ID
7. **Superseding:** never edit the body of an `Accepted` record. Write a new record with `Supersedes: NNNN`, and change only the old record's status line to `Superseded by NNNN`.
8. **Tell the user** which files you created and changed, in one short list.

## Don'ts

- Don't take a decision the user hasn't taken. If they're still weighing options, write it as `Proposed` and say so.
- Don't renumber existing records.
- Don't duplicate content from other docs. Link to it instead.
