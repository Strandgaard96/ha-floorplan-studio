import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";
import { openViewMenu, viewControl } from "./shell-helpers";

// S29 (S1-S5, AC 11, AC 16): the two View options rows in the built card, real clicks, the real localStorage and a real reload.
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c33"/></svg>`;
const ART = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=ok1";
const layout = () => {
  const l = structuredClone(demo);
  l.floors.ground.devices.push({
    id: "spk",
    type: "speaker",
    entity: "media_player.kitchen",
    name: "Kitchen speaker",
    x: 700,
    y: 300,
  });
  Object.assign(l.floors.ground.rooms[0], { temps: ["sensor.t_living"] });
  return l;
};
const STATES = {
  "media_player.kitchen": {
    state: "playing",
    attributes: { entity_picture_local: ART },
    last_changed: new Date().toISOString(),
  },
  "sensor.t_living": { state: "16", attributes: { unit_of_measurement: "°C" }, last_changed: new Date().toISOString() },
  "sensor.demo_living_temperature": {
    state: "16",
    attributes: { unit_of_measurement: "°C" },
    last_changed: new Date().toISOString(),
  },
};
async function boot(page: Page, view: "2d" | "3d", extra: Record<string, unknown> = {}, clear = true) {
  if (clear) {
    await serve(page);
    await page.route(`${ORIGIN}/api/media_player_proxy/**`, (r) =>
      r.fulfill({ body: COVER, contentType: "image/svg+xml" }),
    );
    await page.setViewportSize({ width: 1100, height: 800 });
  }
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, s, clear]) => {
      if (clear) localStorage.clear();
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = { states: s, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: layout(), floor: "ground", view, theme: "light", active_list: false, ...extra }, STATES, clear] as const,
  );
  if (view === "3d") await drawn(page);
}
const count = (page: Page, sel: string) =>
  card(page).evaluate((el, sel) => el.shadowRoot!.querySelectorAll(sel).length, sel);
const count3d = (page: Page, sel: string) =>
  holder(page).evaluate((root, sel) => root.querySelectorAll(sel).length, sel);
const button = (page: Page, name: string) => card(page).locator(`button[aria-label="${name}"]`);

test("AC 11: Cover art off draws the glyph only, and the pick survives a reload", async ({ page }) => {
  await boot(page, "2d");
  await expect.poll(() => count(page, "svg image.art")).toBe(1);
  await openViewMenu(page);
  await button(page, "Cover art").click();
  await expect(button(page, "Cover art")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => count(page, "svg image.art")).toBe(0);
  await boot(page, "2d", {}, false); // a reload: same config, the stored pick
  await expect.poll(() => count(page, "svg g.dev-speaker")).toBe(1);
  expect(await count(page, "svg image.art")).toBe(0);
});

test("AC 16: Temperature colours off: no pill and no ring in 2D or 3D, and the pick survives a reload", async ({
  page,
}) => {
  await boot(page, "2d");
  await expect.poll(() => count(page, "svg rect.val-pill")).toBe(1);
  expect(await count(page, "svg .halo.heat")).toBe(1);
  await openViewMenu(page);
  await button(page, "Temperature colours").click();
  await expect.poll(() => count(page, "svg rect.val-pill")).toBe(0);
  expect(await count(page, "svg .halo.heat")).toBe(0);
  await boot(page, "2d", {}, false); // a reload with the same YAML (a changed `view` would be another memory)
  await expect.poll(() => count(page, "svg g.dev-temp")).toBe(1);
  expect(await count(page, "svg rect.val-pill")).toBe(0);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect.poll(() => count3d(page, ".fp3-rm")).toBeGreaterThan(0);
  expect(await count3d(page, ".val-pill")).toBe(0);
  expect(await count3d(page, ".halo.heat")).toBe(0);
});

test("AC 16: YAML temp_colors false starts off in 3D; the View options turn it on there", async ({ page }) => {
  await boot(page, "3d", { temp_colors: false });
  await expect.poll(() => count3d(page, ".fp3-rm")).toBeGreaterThan(0);
  expect(await count3d(page, ".val-pill")).toBe(0);
  await openViewMenu(page);
  await button(page, "Temperature colours").click();
  await expect.poll(() => count3d(page, ".val-pill")).toBe(1);
});
