// Spike S8: measure the generated component in Storybook and score it against
// the values read from Figma (figma-expected.json). A stand-in for plan item
// 6.6 "reverse verify": snap only measures a component's root, so this script
// also measures the label, value, chip and delta inside it.
//
// Usage: node spikes/s8-component-generation/measure.mjs [storybook-url] [story-id]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { colorToHex } from "../../dist/cli/color.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const STORYBOOK = process.argv[2] ?? "http://localhost:6006";
const STORY = process.argv[3] ?? "components-information-metrictile--basic";
const expected = JSON.parse(fs.readFileSync(path.join(here, "figma-expected.json"), "utf8")).variants;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const rows = [];
// SPIKE_OUT keeps each run's output apart (S8b's first measurement overwrote S8's).
const outDir = process.env.SPIKE_OUT ?? path.join(here, "results");
const shotsDir = path.join(outDir, "screens");
fs.mkdirSync(shotsDir, { recursive: true });

for (const [variant, exp] of Object.entries(expected)) {
  const trend = variant.match(/trend=(\w+)/)[1];
  const size = variant.match(/size=(\w+)/)[1];
  const args = `trend:${trend};size:${size};label:Active shipments;value:1,284;trendLabel:${exp.delta.text.replace("−", "-")}`;
  const url = `${STORYBOOK}/iframe.html?id=${STORY}&viewMode=story&args=${encodeURIComponent(args)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#storybook-root *", { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  const got = await page.evaluate(() => {
    const root = document.querySelector("#storybook-root").firstElementChild;
    const cs = (el) => getComputedStyle(el);
    const texts = [...root.querySelectorAll("*")].filter((el) => el.children.length === 0 && el.textContent.trim());
    const byFont = [...texts].sort((a, b) => parseFloat(cs(b).fontSize) - parseFloat(cs(a).fontSize));
    const value = byFont[0];
    const chipText = texts.find((el) => {
      const p = el.parentElement;
      return p !== root && cs(p).backgroundColor !== "rgba(0, 0, 0, 0)";
    });
    const label = texts.find((el) => el !== value && el !== chipText);
    const chip = chipText?.parentElement;
    const row = value.parentElement;
    const r = root.getBoundingClientRect();
    const font = (el) => el && { fontSize: parseFloat(cs(el).fontSize), fontWeight: Number(cs(el).fontWeight), color: cs(el).color, family: cs(el).fontFamily };
    return {
      root: {
        width: r.width, height: r.height,
        fill: cs(root).backgroundColor,
        stroke: { color: cs(root).borderTopColor, weight: parseFloat(cs(root).borderTopWidth) },
        radius: parseFloat(cs(root).borderTopLeftRadius),
        padding: parseFloat(cs(root).paddingTop),
        gap: parseFloat(cs(root).rowGap),
      },
      label: font(label), value: font(value), delta: { ...font(chipText), text: chipText?.textContent.trim() },
      row: { gap: parseFloat(cs(row).columnGap) },
      chip: chip && { fill: cs(chip).backgroundColor, radius: parseFloat(cs(chip).borderTopLeftRadius), padding: [parseFloat(cs(chip).paddingTop), parseFloat(cs(chip).paddingLeft)] },
    };
  });
  await page.locator("#storybook-root").screenshot({ path: path.join(shotsDir, `${trend}-${size}.png`) });

  const hex = (c) => (c ? colorToHex(c) : null);
  const checks = [
    ["root.width", exp.root.width, got.root.width, 1],
    ["root.height", exp.root.height, got.root.height, 1],
    ["root.fill", exp.root.fill, hex(got.root.fill)],
    ["root.stroke.color", exp.root.stroke.color, hex(got.root.stroke.color)],
    ["root.stroke.weight", exp.root.stroke.weight, got.root.stroke.weight, 0],
    ["root.radius", exp.root.radius, got.root.radius, 0],
    ["root.padding", exp.root.padding, got.root.padding, 0],
    ["root.gap", exp.root.gap, got.root.gap, 0],
    ["label.fontSize", exp.label.fontSize, got.label?.fontSize, 0],
    ["label.fontWeight", exp.label.fontWeight, got.label?.fontWeight, 0],
    ["label.color", exp.label.color, hex(got.label?.color)],
    ["value.fontSize", exp.value.fontSize, got.value?.fontSize, 0],
    ["value.fontWeight", exp.value.fontWeight, got.value?.fontWeight, 0],
    ["value.color", exp.value.color, hex(got.value?.color)],
    ["row.gap", exp.row.gap, got.row.gap, 0],
    ["chip.fill", exp.chip.fill, hex(got.chip?.fill)],
    ["chip.radius", exp.chip.radius, got.chip?.radius, 0],
    ["chip.paddingY", exp.chip.padding[0], got.chip?.padding[0], 0],
    ["chip.paddingX", exp.chip.padding[1], got.chip?.padding[1], 0],
    ["delta.fontSize", exp.delta.fontSize, got.delta?.fontSize, 0],
    ["delta.fontWeight", exp.delta.fontWeight, got.delta?.fontWeight, 0],
    ["delta.color", exp.delta.color, hex(got.delta?.color)],
  ];
  for (const [prop, want, have, tol] of checks) {
    const ok = typeof want === "number" ? typeof have === "number" && Math.abs(want - have) <= tol : String(want).toLowerCase() === String(have).toLowerCase();
    rows.push({ variant, prop, want, have, ok });
  }
  rows.push({ variant, prop: "fontFamily", want: "Inter", have: got.value?.family, ok: /inter/i.test(got.value?.family ?? "") });
}
await browser.close();

const failed = rows.filter((r) => !r.ok);
const score = ((rows.length - failed.length) / rows.length) * 100;
fs.writeFileSync(path.join(outDir, "fidelity.json"), JSON.stringify({ score, total: rows.length, failed, rows }, null, 2));
console.log(`Fidelity: ${score.toFixed(1)}% (${rows.length - failed.length}/${rows.length} properties across ${Object.keys(expected).length} variants)`);
for (const f of failed) console.log(`  ✗ ${f.variant.padEnd(28)} ${f.prop.padEnd(18)} figma=${f.want}  code=${f.have}`);
