import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";
import { openOverview, viewControl } from "./shell-helpers";

// S29 (L1-L4, AC 1-4, Review focus 1): the layer chips in live 3D. Demo ground floor: devices 0 and 1 are the living and kitchen
// lights, 7 the living radiator (a body in 3D), 4 the living temperature sensor. Real page.mouse clicks on the real top element
// (finding 3); the scene is read through the test hook (dist-test/), the overlay from its DOM.
const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: new Date().toISOString(),
});
const STATES = {
  "light.demo_living": st("on", { friendly_name: "Living light" }),
  "light.demo_kitchen": st("on"),
  "climate.demo_living": st("heat", { hvac_action: "heating" }),
};
interface Live {
  balls: { index: number; shown: boolean }[];
  bodies: { index: number; type: string; visible: boolean }[];
  pools: { visible: boolean }[];
  lifted: number[];
}
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fp3d: { live(): unknown } }).__fp3d.live()) as Promise<Live>;
const LIGHTS = [0, 1];

async function boot(page: Page, view: "2d" | "3d" = "3d") {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, states]) => {
      try {
        localStorage.clear();
      } catch {
        /* no storage */
      }
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = { states, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: structuredClone(demo), floor: "ground", view, theme: "light" }, STATES] as const,
  );
  if (view === "3d") await drawn(page);
  await openOverview(page);
}
/** Device indices with an overlay icon whose group is a `type`. */
const icons = (page: Page, type: string) =>
  holder(page).evaluate(
    (root, type) =>
      [...root.querySelectorAll<SVGSVGElement>("svg.fp3-ic")]
        .filter((s) => s.querySelector(`g.dev-${type}`))
        .map((s) => +s.getAttribute("data-i")!)
        .sort((a, b) => a - b),
    type,
  );
async function clickOn(page: Page, sel: string) {
  const p = await card(page).evaluate((el, sel) => {
    const t = el.shadowRoot!.querySelector(sel);
    if (!t) return null;
    t.scrollIntoView({ block: "center" });
    const r = t.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2,
      top = el.shadowRoot!.elementFromPoint(x, y);
    return top && (top === t || t.contains(top)) ? { x, y } : null;
  }, sel);
  expect(p, `${sel} is the top element at its centre`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}
const toggle = (page: Page) => card(page).locator("css=.fp-ov-scopes button.fp-layers-toggle");
const chip = (page: Page, id: string) => card(page).locator(`css=.fp-ov-layers button.fp-layer[data-layer="${id}"]`);
async function hide(page: Page, id: string) {
  if ((await toggle(page).getAttribute("aria-expanded")) !== "true")
    await clickOn(page, ".fp-ov-scopes button.fp-layers-toggle");
  await clickOn(page, `.fp-ov-layers button.fp-layer[data-layer="${id}"]`);
}
const shownBalls = (l: Live, of: number[]) =>
  l.balls
    .filter((b) => of.includes(b.index) && b.shown)
    .map((b) => b.index)
    .sort();

test("AC 1: in live 3D the Lights chip takes away light icons, balls and pools; the room lift stays; a second click brings them back", async ({
  page,
}) => {
  await boot(page);
  await expect(toggle(page)).toBeVisible(); // L4: the Layers button is there in 3D
  await expect.poll(() => icons(page, "light")).toEqual(LIGHTS);
  await expect.poll(async () => (await live(page)).pools.filter((p) => p.visible).length).toBe(2);
  const before = await live(page);
  expect(shownBalls(before, LIGHTS)).toEqual(LIGHTS);
  await hide(page, "lights");
  await expect(toggle(page)).toHaveText("Layers · 1 hidden");
  await expect.poll(() => icons(page, "light")).toEqual([]);
  const hid = await live(page);
  expect(shownBalls(hid, LIGHTS)).toEqual([]);
  expect(hid.pools.filter((p) => p.visible)).toEqual([]);
  expect(hid.lifted).toEqual(before.lifted);
  await clickOn(page, '.fp-ov-layers button.fp-layer[data-layer="lights"]');
  await expect.poll(() => icons(page, "light")).toEqual(LIGHTS);
  await expect.poll(async () => shownBalls(await live(page), LIGHTS)).toEqual(LIGHTS);
  await expect.poll(async () => (await live(page)).pools.filter((p) => p.visible).length).toBe(2);
});

test("L2: a hidden family's body goes too (the radiator, Climate)", async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await live(page)).bodies.find((b) => b.index === 7)?.visible).toBe(true);
  await hide(page, "climate");
  await expect.poll(async () => (await live(page)).bodies.find((b) => b.index === 7)?.visible).toBe(false);
});

test("AC 2: a light found by search stays on the overlay with Lights hidden", async ({ page }) => {
  await boot(page);
  await hide(page, "lights");
  await expect.poll(() => icons(page, "light")).toEqual([]);
  await page.keyboard.press("/");
  await page.keyboard.type("Living light");
  await page.keyboard.press("Enter");
  await expect.poll(() => icons(page, "light")).toEqual([0]);
  await expect(card(page).locator("css=.fp-layer-note")).toContainText("Hidden by Layers: lights");
});

test("AC 3: the Furniture chip is disabled in 3D, enabled in 2D, and its stored state is kept", async ({ page }) => {
  await boot(page, "2d");
  await hide(page, "furniture");
  const stored = () =>
    page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith("fp-view:"))
        .map(([, v]) => JSON.parse(v).layers),
    );
  expect(await stored()).toEqual([["furniture"]]);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect(chip(page, "furniture")).toBeDisabled();
  await expect(chip(page, "furniture")).toHaveAttribute("title", "Furniture hides in 2D only");
  await expect(chip(page, "furniture")).toHaveAttribute("aria-pressed", "false");
  expect(await stored()).toEqual([["furniture"]]);
  await viewControl(page).selectOption("2d");
  await expect(chip(page, "furniture")).toBeEnabled();
  expect(await card(page).evaluate((el) => el.shadowRoot!.querySelectorAll("svg g[data-f]").length)).toBe(0);
});

test("AC 4: Lights hidden in 3D stay hidden in 2D, and in 3D again", async ({ page }) => {
  await boot(page);
  await hide(page, "lights");
  await viewControl(page).selectOption("2d");
  await expect
    .poll(() => card(page).evaluate((el) => el.shadowRoot!.querySelectorAll("svg g.dev-light").length))
    .toBe(0);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect.poll(() => icons(page, "light")).toEqual([]);
});

test("Review focus 1: a tap where a hidden light hangs does not reach the light", async ({ page }) => {
  await boot(page);
  const fold = async () => {
    await card(page).locator("css=button.fp-active-collapse").click(); // the Overview off the canvas: the camera reframes
    await page.waitForTimeout(400); // the reframe, and clear of the double-tap window (DECISIONS 2026-10-11)
  };
  const where = () =>
    page.evaluate(() =>
      (window as unknown as { __fp3d: { where(k: string, i: number): { x: number; y: number } | null } }).__fp3d.where(
        "device",
        0,
      ),
    );
  const pickAt = (p: { x: number; y: number }) =>
    page.evaluate(
      (p) => (window as unknown as { __fp3d: { pick(x: number, y: number): unknown } }).__fp3d.pick(p.x, p.y),
      p,
    );
  // Baseline at the framing the tap will use: shown, the lamp is what the ray meets first there.
  await fold();
  const p = await where();
  expect(p).not.toBeNull();
  expect(await pickAt(p!)).toEqual({ type: "device", index: 0 });
  await openOverview(page);
  await hide(page, "lights");
  await fold();
  expect(await where()).toEqual(p); // same framing, same point
  // Hidden, the ray goes on to whatever lies behind it in the demo (furniture here): never the lamp.
  expect(await pickAt(p!)).not.toEqual({ type: "device", index: 0 });
  await page.mouse.click(p!.x, p!.y);
  await page.waitForTimeout(500);
  await expect(card(page).locator('css=.fp-pop[aria-label="Living light"]')).toHaveCount(0);
});
