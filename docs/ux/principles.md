# UX principles

**Status:** Proposed
**Last reviewed:** 2026-10-07

Rules for every command, message and screen. Each one comes from a friction point in [current-journey.md](current-journey.md).

1. **Every failure names its cause and its fix.** Not "missing docs tools", but "Vue needs `features.experimentalDocgenServer` in `.storybook/main.ts`. Run `storysync fix` to add it." Never guess a cause (like "upgrade Storybook") without checking it.
2. **Show before you change.** Anything that edits the user's repo or Figma file first shows what will change, and asks. Installs say which packages will move.
3. **Nothing is dropped silently.** Skipped props, uncategorized tokens and capped components are always reported, with the reason and how to include them.
4. **Explain the guess.** When Storysync detects something (token source, framework, Storybook type), it says what it picked and why, and how to override it.
5. **Remember answers.** If the user had to tell us something once (URL, token file, category rule), it goes in the config file and isn't asked again.
6. **One command proves it works.** `doctor` checks the whole chain, Storybook to Figma, and ends with ✅ or a list of exact fixes.
7. **Get to the value fast.** The fidelity score and a visible result are the reward. Cut every step that delays the first measured component.
8. **Same result, every surface.** The CLI, JSON, CI and any UI show the same facts, from the same result objects.
