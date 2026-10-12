import { test, expect, type Page } from "@playwright/test";
import { demo, open, card } from "./helpers-3d";

// UI refactor, item 8: the stack fan never overlaps. The ring used to be a fixed size on screen while an icon disc grows
// with the plan, so at close zoom the discs sat on top of each other. Every click is page.mouse on a checked top element
// (CLAUDE.md finding 3); the geometry is read back from the drawn halos and name tags, not from the layout function.

const NAMES = [
  "Stack lamp alpha",
  "Stack lamp bravo",
  "Stack lamp charlie",
  "Stack lamp delta",
  "Stack lamp echo",
  "Stack lamp foxtrot",
];
const layout = (n: number) => {
  const l = structuredClone(demo);
  l.floors.ground.devices = NAMES.slice(0, n).map((name, j) => ({
    id: `s${j}`,
    type: "light",
    entity: `light.s${j}`,
    name,
    x: 400 + j * 2,
    y: 300,
  }));
  return l;
};

const rects = (page: Page) =>
  card(page).evaluate((el) => {
    const sr = el.shadowRoot!;
    const r = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const discs = [...sr.querySelectorAll("svg g.dev.spider")].map((g) => r(g.querySelector(".halo")!));
    const tags = [...sr.querySelectorAll("svg text.spider-lbl")].map(r);
    return { discs, tags };
  });
type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// A disc is a circle: its bounding box would call two diagonal neighbours touching that are not.
const discsTouch = (a: R, b: R) =>
  Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) < (a.w + b.w) / 2;
const tagOnDisc = (t: R, d: R) => {
  const cx = d.x + d.w / 2,
    cy = d.y + d.h / 2;
  return Math.hypot(Math.min(t.x + t.w, Math.max(t.x, cx)) - cx, Math.min(t.y + t.h, Math.max(t.y, cy)) - cy) < d.w / 2;
};

for (const n of [2, 4, 6])
  for (const zoom of [1, 3, 6]) {
    test(`${n} members at zoom ${zoom}: no disc or name tag overlaps another`, async ({ page }) => {
      await page.setViewportSize({ width: 1400, height: 1000 });
      await open(page, { layout: layout(n), floor: "ground", center: [400, 300], zoom_level: zoom });
      await expect(card(page).locator("css=svg g[data-x]")).toHaveCount(n);
      const top = await card(page).evaluate((el, last) => {
        const g = el.shadowRoot!.querySelector<SVGGElement>(`svg g[data-x="${last}"]`)!;
        const b = g.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, n - 1);
      await page.mouse.click(top.x, top.y);
      await expect(card(page).locator("css=svg .spider-leader")).toHaveCount(n);
      const { discs, tags } = await rects(page);
      expect(discs).toHaveLength(n);
      if (process.env.DBG) console.log(JSON.stringify({ discs, tags }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(discsTouch(discs[i], discs[j]), `disc ${i} / disc ${j}`).toBe(false);
          expect(hit(tags[i], tags[j]), `tag ${i} / tag ${j}`).toBe(false);
        }
        for (let j = 0; j < n; j++)
          if (i !== j) expect(tagOnDisc(tags[i], discs[j]), `tag ${i} / disc ${j}`).toBe(false);
      }
    });
  }
