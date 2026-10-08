// `npx storysync` with no command: sets a project up step by step (plan item
// 2.8). It asks before every change, then proves the result with doctor, so a
// first-time user ends with either "Ready" or a list of exact fixes.

import { existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import chalk from "chalk";
import { ask, checkAndFix, closeAnswers, confirm } from "./init.js";
import { CONFIG_FILE, findConfigFile, validateConfig, type StorysyncConfig } from "./config.js";
import { detectTokenSource } from "./tokens.js";
import { runSetup, type Client, type Exec } from "./setup.js";
import { runDoctor, formatDoctor, defaultDoctorDeps, type DoctorDeps } from "./doctor.js";

export interface WizardDeps {
  doctor: DoctorDeps;
  exec?: Exec;
}

const DEFAULT_STORYBOOK_URL = "http://localhost:6006";

/** A Figma file key from a pasted URL or a bare key; null when it's neither. */
export function figmaFileKey(input: string): string | null {
  const fromUrl = /figma\.com\/(?:design|file)\/([0-9a-zA-Z]+)/.exec(input);
  if (fromUrl) return fromUrl[1];
  return /^[0-9a-zA-Z]{10,128}$/.test(input.trim()) ? input.trim() : null;
}

function step(n: number, title: string): void {
  console.log(chalk.bold(`\n── Step ${n} of 4: ${title}`));
}

export async function runWizard(projectInput: string, deps: WizardDeps = { doctor: defaultDoctorDeps }): Promise<void> {
  const project = resolve(projectInput);
  try {
    console.log(chalk.bold("\nWelcome to Storysync."));
    console.log(chalk.dim(`Setting up ${project}. Every change is shown first and needs your yes.`));

    step(1, "Storybook");
    await checkAndFix(project);
    if (process.exitCode === 1) {
      console.log(chalk.yellow("\nStorybook isn't ready yet; fix the above and run `npx storysync` again. The rest of the setup is skipped."));
      return;
    }

    step(2, "Project settings");
    let storybookUrl = DEFAULT_STORYBOOK_URL;
    const existing = findConfigFile(project);
    if (existing) {
      console.log(`${chalk.green("✔")} Keeping ${relative(project, existing) || CONFIG_FILE}`);
    } else {
      const config: StorysyncConfig = { $schema: "./node_modules/storysync/schema.json" };
      storybookUrl = await ask("Where does your Storybook run?", DEFAULT_STORYBOOK_URL);
      if (storybookUrl !== DEFAULT_STORYBOOK_URL) config.storybook = { url: storybookUrl };
      const tokens = detectTokenSource(project);
      if (tokens) {
        console.log(chalk.dim(`  Found design tokens: ${tokens.type} (${relative(project, tokens.path)}). ${tokens.reason}.`));
        if (await confirm("Read design tokens from there?")) config.tokens = { source: tokens.type };
      } else {
        console.log(chalk.dim("  No design tokens found; components can still sync."));
      }
      const figma = await ask("Figma file to sync with (paste its URL, or press Enter to skip)", "");
      const key = figma ? figmaFileKey(figma) : null;
      if (figma && !key) console.log(chalk.yellow("  That isn't a Figma file URL or key; skipped. Add figma.fileKey to the config later."));
      if (key) config.figma = { fileKey: key };

      const problems = validateConfig(config);
      if (problems.length) {
        console.log(chalk.yellow(`  Not writing ${CONFIG_FILE}: ${problems.join("; ")}`));
      } else {
        console.log(chalk.dim(`  ${JSON.stringify(config)}`));
        if (await confirm(`Save these settings to ${CONFIG_FILE}?`)) {
          writeFileSync(join(project, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
          console.log(`${chalk.green("✔")} Wrote ${CONFIG_FILE}`);
        }
      }
    }

    step(3, "AI client");
    const answer = (await ask("Which AI client do you use: claude, cursor, codex, or none?", "claude")).toLowerCase();
    if (answer === "claude" || answer === "cursor" || answer === "codex") {
      if (await confirm(`Set up Storysync for ${answer} and register Storybook MCP with it?`)) {
        await runSetup(answer as Client, project, false, {
          registerMcp: true,
          storybookUrl,
          exec: deps.exec,
          // Default no: it may be another checkout's, since Claude Code shares local servers across a repository's worktrees.
          confirmReplace: (current, wanted) => confirm(`${answer} already has a storybook server pointing at ${current}. Replace it with ${wanted}?`, false),
        });
      }
    } else if (answer !== "none") {
      console.log(chalk.yellow(`  "${answer}" isn't one Storysync knows; skipped. Run later: npx storysync setup --client <claude|cursor|codex>`));
    }

    step(4, "Check");
    const result = await runDoctor({ project, storybookFlag: storybookUrl === DEFAULT_STORYBOOK_URL ? undefined : storybookUrl }, deps.doctor);
    console.log(formatDoctor(result));
    const notRunning = result.checks.find((c) => c.id === "storybook-running" && c.status === "fail");
    if (notRunning) {
      console.log(chalk.bold("\nLast step: start Storybook") + chalk.dim(" (e.g. npm run storybook), then check again: npx storysync doctor"));
    } else if (result.ok) {
      console.log(chalk.bold("\nAll set.") + chalk.dim(" Preview a push with: npx storysync plan"));
    }
    if (!result.ok && !notRunning) process.exitCode = 1;
  } finally {
    closeAnswers();
  }
}

/** Whether `dir` looks like a project the wizard can set up. */
export function looksLikeProject(dir: string): boolean {
  return existsSync(join(resolve(dir), "package.json"));
}
