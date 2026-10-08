# Spike S8b: guided component generation

S8 again with the procedure S8's findings call for. Results: [research note](../../docs/research/2026-10-07-s8b-guided-generation.md).

`run.mjs` is S8's runner plus: a required procedure in the role (reuse check, designer decisions, sizing, typed completion), rules for the scripted designer's answers, policy by place, and cleanup of the worktree's processes. Measure with S8's `measure.mjs`:

```bash
SPIKE_REPO=C:/Personal/projects/vue-component-library-s8b \
SPIKE_FIGMA_URL="https://www.figma.com/design/<key>/Untitled?node-id=33-38" \
  node spikes/s8b-guided-generation/run.mjs

# start that worktree's Storybook on a free port, then:
SPIKE_OUT=spikes/s8b-guided-generation/results \
  node spikes/s8-component-generation/measure.mjs http://localhost:6011 components-information-metrictile--basic
```

Output goes to `results/` (gitignored).
