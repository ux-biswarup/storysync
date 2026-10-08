// What each Storybook framework needs before Storysync can read its components,
// kept as data (ADR 0003). init, doctor and error messages read these, so a
// framework's requirements live in one place instead of in branches across
// the CLI.

export type SupportLevel = "v1" | "works" | "untested";

export interface FrameworkProfile {
  /** Short name, as in storysync.config.json's `framework`. */
  id: string;
  /** The framework package `.storybook/main` names. */
  package: string;
  label: string;
  /** Storybook feature flags this framework needs for the docs tools, beyond what addon-mcp turns on. */
  requiredFeatures: string[];
  /** Why each required feature is needed, for messages. */
  featureReasons: Record<string, string>;
  /** Where prop types come from. */
  docgen: string;
  /** How completely prop types reach Storysync. */
  propQuality: "full" | "partial" | "unknown";
  /** v1 is tested end to end on a real library; works is known to work; untested isn't verified. */
  support: SupportLevel;
  /** Limits a user should know about, with what to do. */
  knownIssues: { id: string; message: string }[];
}

export const FRAMEWORK_PROFILES: FrameworkProfile[] = [
  {
    id: "react-vite",
    package: "@storybook/react-vite",
    label: "React (Vite)",
    requiredFeatures: [],
    featureReasons: {},
    docgen: "react-docgen",
    propQuality: "full",
    support: "v1",
    knownIssues: [],
  },
  {
    id: "vue3-vite",
    package: "@storybook/vue3-vite",
    label: "Vue 3 (Vite)",
    requiredFeatures: ["experimentalDocgenServer"],
    featureReasons: {
      experimentalDocgenServer: "@storybook/vue3-vite builds its component manifest only with docgen on the server",
    },
    docgen: "vue-component-meta, on the server",
    propQuality: "partial",
    support: "v1",
    knownIssues: [
      {
        id: "named-union-types",
        message: "Props typed with a named union (e.g. severity: ButtonSeverity) don't show their values, so they aren't variants unless their argTypes list options.",
      },
    ],
  },
  {
    id: "nextjs-vite",
    package: "@storybook/nextjs-vite",
    label: "Next.js (Vite)",
    requiredFeatures: [],
    featureReasons: {},
    docgen: "react-docgen",
    propQuality: "full",
    support: "works",
    knownIssues: [],
  },
  {
    id: "sveltekit",
    package: "@storybook/sveltekit",
    label: "SvelteKit",
    requiredFeatures: [],
    featureReasons: {},
    docgen: "svelte",
    propQuality: "unknown",
    support: "works",
    knownIssues: [],
  },
  {
    id: "angular",
    package: "@storybook/angular",
    label: "Angular",
    requiredFeatures: [],
    featureReasons: {},
    docgen: "compodoc",
    propQuality: "unknown",
    support: "untested",
    knownIssues: [{ id: "untested", message: "Not yet tested with Storysync (plan spike S3)." }],
  },
  {
    id: "web-components-vite",
    package: "@storybook/web-components-vite",
    label: "Web Components (Vite)",
    requiredFeatures: [],
    featureReasons: {},
    docgen: "custom elements manifest",
    propQuality: "unknown",
    support: "untested",
    knownIssues: [{ id: "untested", message: "Not yet tested with Storysync (plan spike S3)." }],
  },
];

/** The profile for a framework package (`@storybook/vue3-vite`) or id (`vue3-vite`), or null. */
export function frameworkProfile(nameOrPackage: string | null | undefined): FrameworkProfile | null {
  if (!nameOrPackage) return null;
  return FRAMEWORK_PROFILES.find((p) => p.package === nameOrPackage || p.id === nameOrPackage) ?? null;
}

export const SUPPORT_MATRIX_START = "<!-- support-matrix:start (generated from cli/frameworks.ts: pnpm docs:support) -->";
export const SUPPORT_MATRIX_END = "<!-- support-matrix:end -->";

const SUPPORT_WORDS: Record<SupportLevel, string> = { v1: "✅ Supported", works: "Works", untested: "Not tested yet" };
const QUALITY_WORDS: Record<FrameworkProfile["propQuality"], string> = { full: "Full", partial: "Partial", unknown: "Unknown" };

/** The README's framework table, from the profiles, so docs and code can't disagree (plan item 2.7). */
export function renderSupportMatrix(profiles: FrameworkProfile[] = FRAMEWORK_PROFILES): string {
  const rows = profiles.map((p) => {
    const flags = p.requiredFeatures.length ? p.requiredFeatures.map((f) => `\`${f}\``).join(", ") + " (`storysync init` adds it)" : "none";
    const notes = p.knownIssues.map((i) => i.message).join(" ") || "";
    return `| ${p.label} | \`${p.package}\` | ${SUPPORT_WORDS[p.support]} | ${flags} | ${QUALITY_WORDS[p.propQuality]} (${p.docgen}) | ${notes} |`;
  });
  return [
    SUPPORT_MATRIX_START,
    "| Framework | Package | Status | Flags it needs | Prop types | Notes |",
    "|---|---|---|---|---|---|",
    ...rows,
    SUPPORT_MATRIX_END,
  ].join("\n");
}

/** `readme` with its support matrix replaced by a fresh one. Throws when the markers are missing. */
export function updateSupportMatrix(readme: string): string {
  const a = readme.indexOf(SUPPORT_MATRIX_START);
  const b = readme.indexOf(SUPPORT_MATRIX_END);
  if (a < 0 || b < a) throw new Error("README has no support-matrix markers");
  return readme.slice(0, a) + renderSupportMatrix() + readme.slice(b + SUPPORT_MATRIX_END.length);
}

/** The profile's required features that `enabled` doesn't turn on. */
export function missingFeatures(profile: FrameworkProfile | null, enabled: Set<string>): string[] {
  return (profile?.requiredFeatures ?? []).filter((f) => !enabled.has(f));
}
