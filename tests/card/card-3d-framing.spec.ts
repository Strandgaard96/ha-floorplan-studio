import { test, expect, type Page } from "@playwright/test";
import { demo, open, holder, drawn, card } from "./helpers-3d";

// UI refactor item 11: the first 3D view frames the house's box (the shown floor's bounds) so it fills about 85 % of the card's free
// area, the part under the toolbar, on every floor, with floors below on or off, and Reset camera returns to that framing.
// Read from the test hook (`__fp3d`, dist-test only): `bounds()` is the house's box, `project` the camera's own projection, in page px.
type Pt = { x: number; y: number };
const hook = <T>(page: Page, expr: string) => page.evaluate(`(${expr})(window.__fp3d)`) as Promise<T>;

async function screenBox(page: Page) {
  const corners = await hook<Pt[]>(
    page,
    `(h) => { const b = h.bounds(), out = [];
      for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) out.push(h.project(x, y, z));
      return out; }`,
  );
  const host = await holder(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const bar =
        el.getRootNode() instanceof ShadowRoot
          ? (el.getRootNode() as ShadowRoot).querySelector(".fp-zoom, .fp-viewonly")
          : null;
      return {
        l: r.left,
        t: r.top,
        r: r.right,
        b: r.bottom,
        barBottom: bar ? bar.getBoundingClientRect().bottom : r.top,
      };
    }),
    free = { l: host.l, t: Math.max(host.t, host.barBottom), r: host.r, b: host.b },
    xs = corners.map((c) => c.x),
    ys = corners.map((c) => c.y),
    box = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
  return { free, box };
}
/** The camera has stopped: the panel and the toolbar settle the framing a moment after the first frame. */
async function settled(page: Page) {
  let prev = "";
  await expect
    .poll(async () => {
      const c = await holder(page).evaluate((el) => `${el.dataset.dist}|${el.dataset.target}|${el.dataset.inset}`);
      const same = c === prev;
      prev = c;
      return same;
    })
    .toBe(true);
}

for (const width of [900, 375])
  for (const [floor, below] of [
    ["ground", "off"],
    ["first", "off"],
    ["first", "solid"],
    ["first", "ghost"],
  ] as const)
    test(`the ${floor} floor at ${width} px, floors below ${below}: the house fills 84 to 87 % of the free area and stays inside it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, {
        layout: structuredClone(demo),
        floor,
        view: "3d",
        floors_below: below,
        active_list: false,
      });
      await drawn(page);
      await settled(page);
      const { free, box } = await screenBox(page);
      const fw = (box.r - box.l) / (free.r - free.l),
        fh = (box.b - box.t) / (free.b - free.t),
        fill = Math.max(fw, fh);
      expect(fill, `limiting axis: width ${fw.toFixed(3)}, height ${fh.toFixed(3)}`).toBeGreaterThanOrEqual(0.84);
      expect(fill).toBeLessThanOrEqual(0.87);
      // No empty band on one side: the box is centred in the free area, within 2 % of its size.
      const cx = (box.l + box.r) / 2 - (free.l + free.r) / 2,
        cy = (box.t + box.b) / 2 - (free.t + free.b) / 2;
      expect(Math.abs(cx) / (free.r - free.l), "off-centre across").toBeLessThanOrEqual(0.02);
      expect(Math.abs(cy) / (free.b - free.t), "off-centre down").toBeLessThanOrEqual(0.02);
      const slack = 1;
      expect(box.l).toBeGreaterThanOrEqual(free.l - slack);
      expect(box.r).toBeLessThanOrEqual(free.r + slack);
      expect(box.t).toBeGreaterThanOrEqual(free.t - slack);
      expect(box.b).toBeLessThanOrEqual(free.b + slack);
    });

test("Reset camera returns to the same framing after a drag and a wheel turn", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await open(page, { layout: structuredClone(demo), floor: "ground", view: "3d", active_list: false });
  await drawn(page);
  await settled(page);
  const first = await screenBox(page);
  const c = await holder(page).boundingBox();
  await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height - 60);
  await page.mouse.down();
  await page.mouse.move(c!.x + c!.width / 2 + 120, c!.y + c!.height - 100, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);
  const moved = await screenBox(page);
  expect(Math.abs(moved.box.l - first.box.l), "the view did move").toBeGreaterThan(20);
  await card(page).locator('css=button[aria-label="Reset camera"]').click();
  await settled(page);
  const again = await screenBox(page);
  for (const k of ["l", "r", "t", "b"] as const) expect(again.box[k], k).toBeCloseTo(first.box[k], 0);
});
