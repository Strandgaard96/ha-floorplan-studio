import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// UI refactor 2: the popup sits beside the device it was opened from and never covers that device's icon. It takes the side
// (right, left, below, above) with the most room and stays inside the card; on a card narrower than ACTIVE_FOLD_BELOW_PX it is the
// full-width sheet on the half of the card away from the device. Every tap is a real page.mouse click on the icon's real top
// element (CLAUDE.md finding 3).

const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
const URL_ = pathToFileURL(resolve("tests/card/harness.html")).href;
const CARD_JS = readFileSync(resolve("dist/floorplan-studio-card.js"), "utf8");
const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: "2026-10-08T09:30:15Z",
});
const LIGHT = {
  supported_color_modes: ["color_temp", "hs"],
  brightness: 128,
  min_color_temp_kelvin: 2200,
  max_color_temp_kelvin: 6500,
  color_temp_kelvin: 3000,
  hs_color: [30, 60],
};
const STATES = {
  "light.demo_living": st("on", { friendly_name: "Living light", ...LIGHT }),
  "light.demo_kitchen": st("on", { friendly_name: "Kitchen light", ...LIGHT }),
  "switch.demo_hall": st("off"),
  "switch.demo_tv_plug": st("on"),
  "binary_sensor.demo_hall_motion": st("off"),
  "camera.demo_hall": st("idle"),
};
// Demo ground floor: 0 Living light (left), 1 Kitchen light (right), 2 Hall switch (bottom left), 3 TV plug (far left edge),
// 5 Hall motion (middle bottom).
const DEVICES = [0, 1, 2, 3, 5]; // not 6: the camera's box includes its view cone, so the middle of the box is not the icon

async function boot(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(URL_);
  await page.addScriptTag({ content: CARD_JS, type: "module" });
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([cfg, s]) => {
      document.body.style.margin = "0";
      const el = document.getElementById("card") as unknown as HTMLElement & {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(cfg);
      el.hass = { states: s, callService: () => {} };
      return el.updateComplete;
    },
    [{ layout: demo, floor: "ground", active_list: false }, STATES] as const,
  );
}
const card = (page: Page) => page.locator("floorplan-studio-card");

type Box = { left: number; top: number; right: number; bottom: number };
/** Taps device `i` for real and returns the boxes of its icon (read before the tap), the popup and the card; null when it opens none. */
async function tap(page: Page, i: number) {
  const where = await card(page).evaluate((el, i) => {
    const g = el.shadowRoot!.querySelector(`svg g[data-x="${i}"]`)!,
      r = g.getBoundingClientRect();
    const x = r.x + r.width / 2,
      y = r.y + r.height / 2,
      top = el.shadowRoot!.elementFromPoint(x, y);
    return { x, y, hit: !!top?.closest(`g[data-x="${i}"]`), top: top?.outerHTML.slice(0, 120) };
  }, i);
  expect(where.hit, `device ${i} is the top element at its centre, not ${where.top}`).toBe(true);
  await page.mouse.click(where.x, where.y);
  await card(page).locator("css=.fp-pop").waitFor({ state: "visible" });
  return card(page).evaluate((el, i) => {
    const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    return {
      icon: box(el.shadowRoot!.querySelector(`svg g[data-x="${i}"]`)!.getBoundingClientRect()),
      pop: box(el.shadowRoot!.querySelector(".fp-pop")!.getBoundingClientRect()),
      host: box(el.getBoundingClientRect()),
    };
  }, i);
}
const overlap = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
const close = (page: Page) => page.keyboard.press("Escape");

for (const width of [1280, 900]) {
  test.describe(`popup beside its device at ${width} px`, () => {
    test("never covers the device's icon, stays inside the card, and is on the side with the most room", async ({
      page,
    }) => {
      await boot(page, width);
      for (const i of DEVICES) {
        const b = await tap(page, i);
        const tag = `device ${i}`;
        expect(overlap(b.pop, b.icon), `${tag}: the popup covers the icon`).toBe(false);
        expect(b.pop.left, `${tag} inside, left`).toBeGreaterThanOrEqual(b.host.left);
        expect(b.pop.right, `${tag} inside, right`).toBeLessThanOrEqual(b.host.right);
        expect(b.pop.top, `${tag} inside, top`).toBeGreaterThanOrEqual(b.host.top);
        expect(b.pop.bottom, `${tag} inside, bottom`).toBeLessThanOrEqual(b.host.bottom);
        const w = b.pop.right - b.pop.left;
        const roomR = b.host.right - b.icon.right,
          roomL = b.icon.left - b.host.left;
        if (b.pop.left >= b.icon.right) expect(roomR, `${tag}: right chosen`).toBeGreaterThanOrEqual(roomL);
        else if (b.pop.right <= b.icon.left) expect(roomL, `${tag}: left chosen`).toBeGreaterThanOrEqual(roomR);
        else
          expect(Math.max(roomR, roomL), `${tag}: above or below only when no side holds it`).toBeLessThan(w + 12 + 4);
        await close(page);
        await expect(card(page).locator("css=.fp-pop")).toHaveCount(0);
      }
    });

    test("the device on the right of the card gets its popup on the left, the one on the left gets it on the right", async ({
      page,
    }) => {
      await boot(page, width);
      const kitchen = await tap(page, 1); // x 650 of 800: the right half
      expect(kitchen.pop.right, "kitchen light: popup left of the icon").toBeLessThanOrEqual(kitchen.icon.left);
      await close(page);
      const living = await tap(page, 0); // x 250: the left half
      expect(living.pop.left, "living light: popup right of the icon").toBeGreaterThanOrEqual(living.icon.right);
    });
  });
}

test.describe("popup on a card narrower than 480 px", () => {
  test("is the full-width sheet on the half of the card away from the device, and never covers its icon", async ({
    page,
  }) => {
    await boot(page, 375);
    for (const i of DEVICES) {
      const b = await tap(page, i);
      const tag = `device ${i}`;
      expect(overlap(b.pop, b.icon), `${tag}: the popup covers the icon`).toBe(false);
      expect(b.pop.right - b.pop.left, `${tag}: full width`).toBeGreaterThanOrEqual(b.host.right - b.host.left - 10);
      const mid = (b.host.top + b.host.bottom) / 2,
        iconY = (b.icon.top + b.icon.bottom) / 2,
        popY = (b.pop.top + b.pop.bottom) / 2;
      expect(
        popY > mid,
        `${tag}: the sheet is on the other half than the icon (icon ${iconY}, sheet ${popY}, middle ${mid})`,
      ).toBe(iconY < mid);
      expect(b.pop.top).toBeGreaterThanOrEqual(b.host.top);
      expect(b.pop.bottom).toBeLessThanOrEqual(b.host.bottom);
      await close(page);
    }
  });
});
