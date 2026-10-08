// App services (plan item 2.6, ADR 0006): each use case returns a typed
// result instead of printing, so the CLI, --json and the UI render the same
// facts. index.ts keeps the wiring and the text rendering.

import type { ComponentEntry, StorybookClient } from "./storybook.js";
import { selectComponents, findComponent } from "./storybook.js";
import { mapComponent, type CapInfo, type FigmaComponentDefinition, type FigmaVariantProperty, type SkippedProp } from "./mapper.js";
import type { FigmaComponentInfo, FigmaVariable } from "./figma.js";
import { diffTokens, diffComponents, selectDiffComponents, narrowFigmaComponents, computeDiffSummary, type TokenDiffEntry, type ComponentDiffEntry, type DiffSummary } from "./diff.js";
import { detectTokenSource, extractTokens, summarizeUncategorized, type TokenExtractionResult, type TokenSourceType } from "./tokens.js";
import { frameworkProfile, type FrameworkProfile } from "./frameworks.js";
import { findStorybookConfig, configFramework } from "./init.js";

/** The part of StorybookClient the services use, so tests can stand in for it. */
export type StorybookReader = Pick<StorybookClient, "listComponents" | "getComponent">;

// --- map ---------------------------------------------------------------------

export interface MappedComponent {
  name: string;
  title?: string;
  category?: string;
  variantProperties: FigmaVariantProperty[];
  combinations: number;
  capped: boolean;
  cap?: CapInfo;
  skippedProps: SkippedProp[];
  error: string | null;
}

export interface MapResult {
  components: MappedComponent[];
  summary: { total: number; mapped: number; failed: number; capped: number; totalCombinations: number };
}

export interface MapOptions {
  components?: string[];
  maxCombinations: number;
  /** After listing, before --components is applied: how many Storybook has. */
  onListed?: (found: number) => void;
  /** After --components is applied: how many it kept. */
  onSelected?: (selected: number) => void;
  /** After each component, mapped or failed. */
  onComponent?: (c: MappedComponent) => void;
}

/** Maps each component's props to Figma variant properties. A failed listing throws; a failed component is recorded and the rest go on. */
export async function mapComponents(storybook: StorybookReader, opts: MapOptions): Promise<MapResult> {
  let entries: ComponentEntry[] = await storybook.listComponents();
  opts.onListed?.(entries.length);
  // A typo'd name is an error whatever the flags. Filtered out silently, map
  // would exit 0 with an empty or partial mapping and CI go green.
  if (opts.components) {
    entries = selectComponents(entries, opts.components);
    opts.onSelected?.(entries.length);
  }

  const components: MappedComponent[] = [];
  let totalCombinations = 0, capped = 0, failed = 0;
  for (const entry of entries) {
    let c: MappedComponent;
    try {
      const component = await storybook.getComponent(entry.id, entry.name, entry.title, entry.category);
      const def = mapComponent(component, opts.maxCombinations);
      c = {
        name: entry.name, title: entry.title, category: entry.category,
        variantProperties: def.variantProperties, combinations: def.variantCombinations.length, capped: def.wasCapped,
        ...(def.cap ? { cap: def.cap } : {}), skippedProps: def.skippedProps ?? [], error: null,
      };
      totalCombinations += c.combinations;
      if (c.capped) capped++;
    } catch (err) {
      failed++;
      c = { name: entry.name, title: entry.title, category: entry.category, variantProperties: [], combinations: 0, capped: false, skippedProps: [], error: String(err) };
    }
    components.push(c);
    opts.onComponent?.(c);
  }
  return { components, summary: { total: entries.length, mapped: entries.length - failed, failed, capped, totalCombinations } };
}

// --- inspect -----------------------------------------------------------------

export interface InspectedProp {
  name: string;
  type: string;
  variant: FigmaVariantProperty | null;
  skipReason: string | null;
}

export interface InspectResult {
  name: string;
  props: InspectedProp[];
  variantProperties: number;
  combinations: number;
  capped: boolean;
}

/** How one component's props map to Figma variants. A name that matches nothing throws, naming what exists. */
export async function inspectComponent(storybook: StorybookReader, name: string): Promise<InspectResult> {
  const entry = findComponent(await storybook.listComponents(), name);
  const component = await storybook.getComponent(entry.id, entry.name);
  const def = mapComponent(component);
  return {
    name: component.name,
    props: component.props.map((prop) => ({
      name: prop.name,
      type: prop.type.name,
      variant: def.variantProperties.find((v) => v.name === prop.name) ?? null,
      skipReason: def.skippedProps?.find((s) => s.name === prop.name)?.reason ?? null,
    })),
    variantProperties: def.variantProperties.length,
    combinations: def.variantCombinations.length,
    capped: def.wasCapped,
  };
}

// --- tokens ------------------------------------------------------------------

export interface TokensResult {
  /** The detected source, when none was chosen. */
  detected: ReturnType<typeof detectTokenSource>;
  result: TokenExtractionResult;
  totalTokens: number;
  uncategorized: ReturnType<typeof summarizeUncategorized>;
}

export function readTokens(projectPath: string, source?: TokenSourceType): TokensResult {
  const detected = source ? null : detectTokenSource(projectPath);
  const result = extractTokens(projectPath, source);
  return {
    detected,
    result,
    totalTokens: result.collections.reduce((n, c) => n + c.tokens.length, 0),
    uncategorized: summarizeUncategorized(result.warnings),
  };
}

// --- diff --------------------------------------------------------------------

/** The part of FigmaClient diff reads with. */
export interface FigmaReader {
  getVariables(fileKey: string, mode?: string): Promise<FigmaVariable[]>;
  getComponents(fileKey: string): Promise<FigmaComponentInfo[]>;
}

export type DiffStep = "figma-variables" | "figma-components" | "storybook-components";

/** Progress, so a CLI can show spinners and a UI a status line, in the order things happen. */
export interface DiffEvents {
  onStart?: (step: DiffStep) => void;
  onDone?: (step: DiffStep, message: string) => void;
  onFail?: (step: DiffStep, message: string, err: unknown) => void;
  /** Components code has that couldn't be mapped, after the mapping step. */
  onMappingFailures?: (failures: { name: string; error: string }[]) => void;
}

export interface DiffRunResult {
  tokenDiffs: TokenDiffEntry[];
  componentDiffs: ComponentDiffEntry[];
  summary: DiffSummary;
  figmaReadFailed: boolean;
  storybookReadFailed: boolean;
  mappingFailures: { name: string; error: string }[];
  /** Whether any tokens were read on either side, to tell "in sync" from "nothing to compare". */
  tokensRead: boolean;
}

export interface DiffOptions {
  fileKey: string;
  mode?: string;
  project: string;
  source?: TokenSourceType;
  components?: string[];
}

/**
 * Compares the Figma file with code: tokens always, components when a
 * Storybook is given. A read that fails is recorded and the rest goes on, so
 * the result says what is partial. A --components name in neither is thrown.
 */
export async function diffWithFigma(figma: FigmaReader, storybook: StorybookReader | null, opts: DiffOptions, ev: DiffEvents = {}): Promise<DiffRunResult> {
  let figmaReadFailed = false;
  let storybookReadFailed = false;

  ev.onStart?.("figma-variables");
  let figmaVars: FigmaVariable[] = [];
  try {
    figmaVars = await figma.getVariables(opts.fileKey, opts.mode);
    ev.onDone?.("figma-variables", `Read ${figmaVars.length} Figma variables`);
  } catch (err) {
    figmaReadFailed = true;
    ev.onFail?.("figma-variables", "Failed to read Figma variables", err);
  }
  const codeResult = extractTokens(opts.project, opts.source);
  const tokenDiffs = figmaReadFailed ? [] : diffTokens(codeResult.collections, figmaVars);

  let componentDiffs: ComponentDiffEntry[] = [];
  let mappingFailures: { name: string; error: string }[] = [];
  if (storybook) {
    ev.onStart?.("figma-components");
    let figmaComponents: FigmaComponentInfo[] = [];
    let componentReadFailed = false;
    try {
      figmaComponents = await figma.getComponents(opts.fileKey);
      ev.onDone?.("figma-components", `Read ${figmaComponents.length} Figma components`);
    } catch (err) {
      componentReadFailed = true;
      figmaReadFailed = true;
      ev.onFail?.("figma-components", "Failed to read Figma components", err);
    }

    if (!componentReadFailed) {
      ev.onStart?.("storybook-components");
      let entries: ComponentEntry[] = [];
      try {
        entries = await storybook.listComponents();
      } catch (err) {
        storybookReadFailed = true;
        ev.onFail?.("storybook-components", "Failed to list Storybook components", err);
      }
      if (opts.components) {
        if (storybookReadFailed) {
          // Names are checked only against a list that was read: when listing
          // failed, that is the error, and every name would look like a typo.
          // Figma is still narrowed to them, or every Figma component left out
          // would be reported as not in code.
          figmaComponents = narrowFigmaComponents(figmaComponents, opts.components);
        } else {
          ({ entries, figmaComponents } = selectDiffComponents(entries, figmaComponents, opts.components));
        }
      }

      const codeComponents: FigmaComponentDefinition[] = [];
      for (const entry of entries) {
        try {
          const component = await storybook.getComponent(entry.id, entry.name, entry.title, entry.category);
          codeComponents.push(mapComponent(component));
        } catch (err) {
          mappingFailures.push({ name: entry.name, error: String(err) });
        }
      }
      if (!storybookReadFailed) ev.onDone?.("storybook-components", `Mapped ${codeComponents.length} Storybook components`);
      if (mappingFailures.length) ev.onMappingFailures?.(mappingFailures);

      // A component code has but could not map was never compared, so
      // Figma's copy of it is not "not in code".
      const unmapped = new Set(mappingFailures.map((failure) => failure.name.toLowerCase()));
      componentDiffs = diffComponents(codeComponents, figmaComponents)
        .filter((c) => !(c.status === "figma_only" && unmapped.has(c.name.toLowerCase())));
    }
  }

  return {
    tokenDiffs,
    componentDiffs,
    summary: computeDiffSummary(tokenDiffs, componentDiffs),
    figmaReadFailed,
    storybookReadFailed,
    mappingFailures,
    tokensRead: figmaVars.length > 0 || codeResult.collections.length > 0,
  };
}

// --- plan (2.5) --------------------------------------------------------------

export interface PlanResult {
  tokens: {
    source: string;
    sourcePath: string;
    /** Why this source, when it was detected. */
    reason?: string;
    collections: { category: string; count: number }[];
    total: number;
    uncategorized: number;
    uncategorizedGroups: { prefix: string; count: number }[];
  } | null;
  /** Null when Storybook couldn't be read; `componentsError` says why. */
  components: MapResult | null;
  componentsError?: string;
  framework: { label: string; support: FrameworkProfile["support"]; knownIssues: string[] } | null;
  /** What a push would create in Figma. */
  figma: { variableCollections: number; variables: number; componentSets: number; variants: number };
  /** Things to look at before pushing, one line each. */
  attention: string[];
}

export interface PlanOptions {
  project: string;
  source?: TokenSourceType;
  storybook: StorybookReader | null;
  storybookError?: string;
  components?: string[];
  maxCombinations: number;
  /** storysync.config.json's framework, when set. */
  framework?: string;
  onComponent?: (c: MappedComponent) => void;
}

/**
 * What a push would do to the Figma file, without writing anything (UX
 * principle 2): token collections and counts, components and their variants,
 * props that won't become variants and why, caps, and the framework's known
 * limits.
 */
export async function planPush(opts: PlanOptions): Promise<PlanResult> {
  const attention: string[] = [];

  const t = readTokens(opts.project, opts.source);
  const tokens = t.totalTokens || t.uncategorized.uncategorized
    ? {
        source: t.result.source,
        sourcePath: t.result.sourcePath,
        ...(t.detected ? { reason: t.detected.reason } : {}),
        collections: t.result.collections.map((c) => ({ category: c.category, count: c.tokens.length })),
        total: t.totalTokens,
        uncategorized: t.uncategorized.uncategorized,
        uncategorizedGroups: t.uncategorized.groups,
      }
    : null;
  if (!tokens) attention.push("No design tokens found: Figma gets components without variables to bind to. Pass --source or set tokens.source in storysync.config.json.");
  else if (tokens.uncategorized) attention.push(`${tokens.uncategorized} token variables match no category and won't become Figma variables.`);

  let components: MapResult | null = null;
  let componentsError = opts.storybookError;
  if (opts.storybook) {
    try {
      components = await mapComponents(opts.storybook, { components: opts.components, maxCombinations: opts.maxCombinations, onComponent: opts.onComponent });
    } catch (err) {
      componentsError = err instanceof Error ? err.message : String(err);
    }
  }
  if (componentsError) attention.push(`Components can't be planned: ${componentsError}`);
  for (const c of components?.components ?? []) {
    const label = c.title ?? c.name;
    if (c.error) attention.push(`${label}: couldn't be read (${c.error}).`);
    else if (c.capped) attention.push(`${label}: ${c.cap?.totalPossible} combinations, capped at ${c.cap?.generated}. Narrow its variants or raise --max-combinations.`);
    const hidden = c.skippedProps.filter((p) => p.kind === "unresolved-type");
    if (hidden.length) attention.push(`${label}: ${hidden.map((p) => p.name).join(", ")} won't be variants: their types don't show their values.`);
  }

  const sbConfig = findStorybookConfig(opts.project);
  const profile = frameworkProfile(opts.framework ?? (sbConfig ? configFramework(sbConfig.content) : null));
  const framework = profile ? { label: profile.label, support: profile.support, knownIssues: profile.knownIssues.map((i) => i.message) } : null;

  const ok = components?.components.filter((c) => !c.error) ?? [];
  return {
    tokens,
    components,
    ...(componentsError ? { componentsError } : {}),
    framework,
    figma: {
      variableCollections: tokens?.collections.length ?? 0,
      variables: tokens?.total ?? 0,
      componentSets: ok.length,
      variants: ok.reduce((n, c) => n + c.combinations, 0),
    },
    attention,
  };
}
