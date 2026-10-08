// storysync.config.json: settings a project gives once instead of on every
// command (ADR 0004). Precedence, for every setting: flag > environment
// variable > config file > default or detection.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { TOKEN_SOURCES, type TokenSourceType } from "./tokens.js";

export const CONFIG_FILE = "storysync.config.json";

export interface StorysyncConfig {
  $schema?: string;
  storybook?: { url?: string };
  /** A framework profile id, e.g. "vue3-vite". Detected from .storybook/main when left out. */
  framework?: string;
  tokens?: { source?: TokenSourceType };
  components?: { include?: string[]; maxCombinations?: number };
  figma?: { fileKey?: string };
}

export interface LoadedConfig {
  /** The file read, or null when there is none. */
  path: string | null;
  config: StorysyncConfig;
}

/** Where a setting's value came from, so doctor and messages can say. */
export type SettingSource = "flag" | "env" | "config" | "default";

export interface Setting<T> {
  value: T;
  from: SettingSource;
}

/** The environment variables each setting reads. */
export const ENV = {
  storybookUrl: "STORYSYNC_STORYBOOK_URL",
  figmaFileKey: "STORYSYNC_FIGMA_FILE_KEY",
} as const;

/**
 * The nearest storysync.config.json at or above `startDir`, stopping at the
 * repository root, as the package manager lookup does.
 */
export function findConfigFile(startDir: string): string | null {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    const path = join(dir, CONFIG_FILE);
    if (existsSync(path)) return path;
    if (existsSync(join(dir, ".git")) || dirname(dir) === dir) return null;
  }
}

/**
 * Reads and checks the config file. Unknown keys and wrong types are errors
 * that name the key, so a typo can't be silently ignored.
 */
export function loadConfig(startDir: string): LoadedConfig {
  const path = findConfigFile(startDir);
  if (!path) return { path: null, config: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const problems = validateConfig(raw);
  if (problems.length) throw new Error(`${path} has ${problems.length === 1 ? "a problem" : "problems"}:\n  ${problems.join("\n  ")}`);
  return { path, config: raw as StorysyncConfig };
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

/** Problems with a parsed config, one line each. Empty when it's valid. */
export function validateConfig(raw: unknown): string[] {
  if (!isObject(raw)) return ["the file must hold a JSON object"];
  const problems: string[] = [];
  const allowed: Record<string, string[] | null> = {
    $schema: null,
    storybook: ["url"],
    framework: null,
    tokens: ["source"],
    components: ["include", "maxCombinations"],
    figma: ["fileKey"],
  };
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in allowed)) {
      problems.push(`unknown key "${key}" (known: ${Object.keys(allowed).join(", ")})`);
      continue;
    }
    const children = allowed[key];
    if (children === null) {
      if (typeof value !== "string") problems.push(`"${key}" must be a string`);
      continue;
    }
    if (!isObject(value)) {
      problems.push(`"${key}" must be an object`);
      continue;
    }
    for (const child of Object.keys(value)) {
      if (!children.includes(child)) problems.push(`unknown key "${key}.${child}" (known: ${children.join(", ")})`);
    }
  }
  const c = raw as StorysyncConfig;
  if (c.storybook?.url !== undefined && !isHttpUrl(c.storybook.url)) problems.push(`"storybook.url" must be an http(s) URL`);
  if (c.tokens?.source !== undefined && !(TOKEN_SOURCES as readonly string[]).includes(c.tokens.source)) {
    problems.push(`"tokens.source" must be one of ${TOKEN_SOURCES.join(", ")}`);
  }
  const include = c.components?.include;
  if (include !== undefined && (!Array.isArray(include) || include.some((n) => typeof n !== "string" || !n.trim()))) {
    problems.push(`"components.include" must be a list of component names`);
  }
  const max = c.components?.maxCombinations;
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) problems.push(`"components.maxCombinations" must be a positive whole number`);
  if (c.figma?.fileKey !== undefined && (typeof c.figma.fileKey !== "string" || !/^[0-9a-zA-Z]{10,128}$/.test(c.figma.fileKey))) {
    problems.push(`"figma.fileKey" must be a Figma file key (the part of the URL after /design/)`);
  }
  return problems;
}

function isHttpUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

/** Picks a setting by precedence: flag, then environment, then config, then the default. */
export function resolveSetting<T>(sources: { flag?: T; env?: T; config?: T; fallback: T }): Setting<T> {
  if (sources.flag !== undefined) return { value: sources.flag, from: "flag" };
  if (sources.env !== undefined) return { value: sources.env, from: "env" };
  if (sources.config !== undefined) return { value: sources.config, from: "config" };
  return { value: sources.fallback, from: "default" };
}

/** An environment variable's value, or undefined when unset or blank. */
export function envValue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}
