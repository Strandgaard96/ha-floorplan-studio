import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";

// S33.4 in the 3D view (upstream's spec has 2D only, the card binds both): `tap_action` and `hold_action` on a device icon,
// and the fan (S33.1/S33.2). Every move and click is a real page.mouse event at the screen position of a solid, asked of the
// view's test hook (`__fp3d`), and the view itself is asked what it finds there first (CLAUDE.md finding 3). Demo ground
// floor: device 0 is the living light, 3 the TV plug, 6 the camera; first floor: 6 is the bedroom fan.

type Where = { x: number; y: number };
const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: "2026-10-04T09:30:15Z",
});
const STATES = {
  "light.demo_living": st("on", {
    friendly_name: "Living light",
    supported_color_modes: ["brightness"],
    brightness: 128,
  }),
  "light.demo_kitchen": st("on"),
  "switch.demo_hall": st("off"),
  "switch.demo_tv_plug": st("on"),
  "camera.demo_hall": st("idle"),
  "fan.demo_bedroom": st("on", {
    friendly_name: "Bedroom fan",
    percentage: 40,
    percentage_step: 1,
    supported_features: 1,
  }),
};

async function boot(page: Page, extra: Record<string, unknown> = {}, floor = "ground") {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, states]) => {
      const w = window as unknown as { __calls: string[]; __info: string[] };
      w.__calls = [];
      w.__info = [];
      const el = document.getElementById("card") as unknown as HTMLElement & {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.addEventListener("hass-more-info", (e) => w.__info.push((e as CustomEvent).detail.entityId));
      el.setConfig(config);
      // callService(domain, service, data), as Home Assistant's hass has it
      el.hass = {
        states,
        callService: (d: string, s: string, data: { entity_id: string }) => {
          w.__calls.push(`${d}.${s} ${data.entity_id}`);
        },
      };
      return el.updateComplete;
    },
    [{ layout: structuredClone(demo), floor, view: "3d", ...extra }, STATES] as const,
  );
  await drawn(page);
  await settled(page);
}
async function settled(page: Page) {
  let prev = "";
  await expect
    .poll(
      async () => {
        const v = ["inset", "az", "polar", "dist", "target", "lowered"].map((k) =>
          holder(page).getAttribute(`data-${k}`),
        );
        const now = (await Promise.all(v)).join("|"),
          same = now === prev;
        prev = now;
        return same;
      },
      { intervals: [250], timeout: 10000 },
    )
    .toBe(true);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
const infos = (page: Page) => page.evaluate(() => (window as unknown as { __info: string[] }).__info);
const where = (page: Page, kind: string, index: number) =>
  page.evaluate(
    ([k, i]) =>
      (window as unknown as { __fp3d: { where(k: string, i: number): Where | null } }).__fp3d.where(
        k as string,
        i as number,
      ),
    [kind, index] as const,
  );
const picks = (page: Page, p: Where) =>
  page.evaluate(
    (p) => (window as unknown as { __fp3d: { pick(x: number, y: number): unknown } }).__fp3d.pick(p.x, p.y),
    p,
  );
const pop = (page: Page) => card(page).locator("css=.fp-pop");

/** The screen position of device `i`, after checking the view reports that device there. */
async function device(page: Page, i: number) {
  await page.waitForTimeout(400); // two taps within 350 ms and 24 px are a double tap, by design: keep clear of the last one
  await settled(page);
  const p = (await where(page, "device", i))!;
  expect(await picks(page, p), `what the view finds at ${Math.round(p.x)},${Math.round(p.y)}`).toEqual({
    type: "device",
    index: i,
  });
  return p;
}

const hold = async (page: Page, p: Where) => {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
};

test.describe("3D tap_action and hold_action", () => {
  test("toggle: a real tap turns a light off at once, no popup", async ({ page }) => {
    await boot(page, { tap_action: { action: "toggle" } });
    const p = await device(page, 0);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => calls(page)).toEqual(["light.turn_off light.demo_living"]);
    await expect(pop(page)).toHaveCount(0);
  });

  test("toggle: an on plug opens the popup at Yes, turn off and calls nothing until that is clicked", async ({
    page,
  }) => {
    await boot(page, { tap_action: "toggle" });
    await page.evaluate(() =>
      (window as unknown as { __fp3d: { look(az: number, polar: number): void } }).__fp3d.look(0, 0.5),
    );
    const p = await device(page, 3);
    await page.mouse.click(p.x, p.y);
    await expect(pop(page).locator("css=.fp-pop-do")).toHaveText("Yes, turn off");
    expect(await calls(page)).toEqual([]);
    await pop(page).locator("css=.fp-pop-do").click();
    expect(await calls(page)).toEqual(["switch.turn_off switch.demo_tv_plug"]);
  });

  test("more-info: a tap fires hass-more-info and opens no popup", async ({ page }) => {
    await boot(page, { tap_action: { action: "more-info" } });
    const p = await device(page, 0);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => infos(page)).toEqual(["light.demo_living"]);
    await expect(pop(page)).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
  });

  test("hold_action none: a 650 ms hold does nothing, and the release opens no popup", async ({ page }) => {
    await boot(page, { hold_action: "none" });
    const p = await device(page, 0);
    await hold(page, p);
    expect(await infos(page)).toEqual([]);
    expect(await calls(page)).toEqual([]);
    await expect(pop(page)).toHaveCount(0);
  });

  test("a hold with no hold_action is more-info", async ({ page }) => {
    await boot(page);
    const p = await device(page, 0);
    await hold(page, p);
    expect(await infos(page)).toEqual(["light.demo_living"]);
  });

  test("kiosk never holds, whatever hold_action says", async ({ page }) => {
    await boot(page, { kiosk: true, hold_action: "more-info" });
    const p = await device(page, 0);
    await hold(page, p);
    expect(await infos(page)).toEqual([]);
  });
});

test.describe("3D fan", () => {
  test("the fan has a marker on the first floor, and a real tap opens a popup with a Speed slider that makes one fan.set_percentage", async ({
    page,
  }) => {
    await boot(page, {}, "first");
    await expect(card(page).locator("css=.fp3-ic")).toHaveCount(7);
    const p = await device(page, 6);
    await page.mouse.click(p.x, p.y);
    await expect(pop(page)).toHaveAttribute("aria-label", "Bedroom fan");
    const slider = pop(page).locator('css=input[aria-label="Speed"]');
    await expect(slider).toHaveValue("40");
    expect(await calls(page)).toEqual([]);
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = "70";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.length)).toBe(1);
    expect((await calls(page))[0]).toBe("fan.set_percentage fan.demo_bedroom");
  });

  test("toggle: a tap turns a fan off at once (a fan is a plain on/off), in 3D too", async ({ page }) => {
    await boot(page, { tap_action: "toggle" }, "first");
    const p = await device(page, 6);
    await page.mouse.click(p.x, p.y);
    await expect(pop(page).locator("css=.fp-pop-do")).toHaveText("Yes, turn off");
    expect(await calls(page)).toEqual([]);
  });
});
