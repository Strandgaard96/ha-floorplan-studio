import { test, expect, type Page } from "@playwright/test";
import { FLOORPLAN_CSS, THEMES } from "../../src/core/render";

// S29 (H3, AC 17): the temperature tokens and the mixing rule, read back from Chromium in every theme and in Home Assistant dark
// (finding 17: the whole union, never a subset). Colours are resolved on a canvas, so any CSS colour syntax compares as 0..255.
const CASES = [...THEMES.map((t) => ({ t, mode: "light" })), { t: "ha", mode: "dark" }] as const;
const body =
  `<rect class="p-cold" style="fill:var(--fp-temp-cold)"/><rect class="p-mid" style="fill:var(--fp-temp-mid)"/>` +
  `<rect class="p-hot" style="fill:var(--fp-temp-hot)"/>` +
  `<rect class="val-pill p-q1" style="--fp-temp-t:0.25;fill:var(--fp-temp)"/>` +
  `<rect class="val-pill p-q3" style="--fp-temp-t:0.75;fill:var(--fp-temp)"/>`;

async function read(page: Page) {
  await page.setContent(
    `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg>${CASES.map((c, i) => `<g id="c${i}" data-theme="${c.t}" data-mode="${c.mode}">${body}</g>`).join("")}</svg></body></html>`,
  );
  return page.evaluate((n) => {
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "#000";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    return Array.from({ length: n }, (_, i) => {
      const g = document.getElementById(`c${i}`)!,
        f = (s: string) => rgb(getComputedStyle(g.querySelector(s)!).fill);
      return {
        raw: ["--fp-temp-cold", "--fp-temp-mid", "--fp-temp-hot"].map((k) =>
          getComputedStyle(g).getPropertyValue(k).trim(),
        ),
        plugMid: getComputedStyle(g).getPropertyValue("--fp-heat-mid").trim(),
        cold: f(".p-cold"),
        mid: f(".p-mid"),
        hot: f(".p-hot"),
        q1: f(".p-q1"),
        q3: f(".p-q3"),
      };
    });
  }, CASES.length);
}
const half = (a: number[], b: number[]) => a.map((v, k) => (v + b[k]!) / 2);
const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) <= 2);
const far = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]!), 0) > 60;

test("AC 17: every theme, HA light and dark included, declares --fp-temp-cold, -mid and -hot, three distinct colours", async ({
  page,
}) => {
  const r = await read(page);
  CASES.forEach((c, i) => {
    const tag = `${c.t}/${c.mode}`;
    for (const v of r[i]!.raw) expect(v, `${tag}: declared`).not.toBe("");
    expect(far(r[i]!.cold, r[i]!.hot), `${tag}: cold and hot differ`).toBe(true);
    expect(far(r[i]!.cold, r[i]!.mid) && far(r[i]!.mid, r[i]!.hot), `${tag}: mid differs from both`).toBe(true);
  });
});

test("the rule mixes by --fp-temp-t: .25 is half cold, half mid; .75 half mid, half hot", async ({ page }) => {
  const r = await read(page);
  CASES.forEach((c, i) => {
    const v = r[i]!;
    expect(near(v.q1, half(v.cold, v.mid)), `${c.t}/${c.mode} q1 ${v.q1} vs ${half(v.cold, v.mid)}`).toBe(true);
    expect(near(v.q3, half(v.mid, v.hot)), `${c.t}/${c.mode} q3 ${v.q3} vs ${half(v.mid, v.hot)}`).toBe(true);
  });
});

test("Review focus 2: the plug ramp's fixed hues are the same in every theme", async ({ page }) => {
  const r = await read(page);
  CASES.forEach((c, i) => expect(r[i]!.plugMid, `${c.t}/${c.mode}`).toBe("#f0a020"));
});
