# Spike S8: Figma component → code, by headless Claude Code

Results: [research note](../../docs/research/2026-10-07-s8-component-generation.md).

| File | Role |
|---|---|
| `run.mjs` | Runs headless Claude Code in a worktree of the target library with a designer's request; a scripted "UI" approves work inside the worktree and answers questions |
| `measure.mjs` | Renders each variant from Storybook in Chrome and scores label, value, chip and root styles against `figma-expected.json` |
| `figma-expected.json` | The design's values, read from Figma with `use_figma` |

```bash
# 1. a detached worktree of the target library, with node_modules and addon-mcp set up
git -C ../vue-component-library worktree add --detach ../vue-component-library-s8 HEAD

# 2. generate
SPIKE_REPO=C:/Personal/projects/vue-component-library-s8 \
SPIKE_FIGMA_URL="https://www.figma.com/design/<key>/Untitled?node-id=33-38" \
  node spikes/s8-component-generation/run.mjs

# 3. start that worktree's Storybook, then measure
node spikes/s8-component-generation/measure.mjs http://localhost:6006
```

Output goes to `results/` (gitignored).
