import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openViewMenu, viewControl } from "./shell-helpers";
import { open as open3d, configure as configure3d, drawn, holder, card as card3d } from "./helpers-3d";

// S33.8 (docs/specs/extras-s33.md, X3 Card, criterion 10), as this fork draws it: the layout's saved views are the Views row of the
// View options popover (the fork has no ⋯ menu), one toggle button per view, `data-view` the view's id. A pick is a viewer's pick: floor, then mode, then turn (a view that names
// none is turned 0), then zoom and centre (zoom is a ratio against the card's own fit). It is remembered like any pick; Reset view
// goes back to the config. A view on a floor the card's `floors` leaves out is not offered. Real clicks on the real popover.

const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
const URL_ = pathToFileURL(resolve("tests/card/harness.html")).href;
const CARD_JS = readFileSync(resolve("dist/floorplan-studio-card.js"), "utf8");

const VIEWS = [
  { id: "view-bed-close", name: "Bed close", floor: "first", zoom: 3, center: [120, 90] },
  { id: "view-turned", name: "Turned flat", floor: "ground", rotation: 90, mode: "2.5d" },
  { id: "view-test-room", name: "Test room", floor: "test", zoom: 2, center: [200, 200] },
  { id: "view-3d", name: "House in 3D", floor: "ground", mode: "3d" },
  { id: "2d", name: "Clashes with the 2D mode", floor: "ground" },
];
const withViews = (views: unknown) => ({ ...structuredClone(demo), views });

const card = (page: Page) => page.locator("floorplan-studio-card");
const viewBox = (page: Page) =>
  card(page).evaluate((el) =>
    el.shadowRoot!.querySelector("svg.fp-zoomable")!.getAttribute("viewBox")!.split(/\s+/).map(Number),
  );
const planDeg = (page: Page) =>
  card(page).evaluate((el) => {
    const m = el
      .shadowRoot!.querySelector("svg g.plan-turn")
      ?.getAttribute("transform")
      ?.match(/^rotate\((-?[\d.]+)/);
    return m ? Number(m[1]) : 0;
  });
const settled = (page: Page) => expect(card(page).locator("css=svg.fp-turning")).toHaveCount(0);
const chip = (page: Page, title: string) =>
  card(page)
    .locator("css=.fp-floors button")
    .filter({ hasText: new RegExp(`^${title}`) });
const shownFloor = (page: Page) =>
  card(page).evaluate(
    (el) =>
      [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".fp-floors button")]
        .find((b) => b.getAttribute("aria-pressed") === "true")
        ?.textContent?.trim()
        .split(" ")[0] ?? "",
  );
const view = (id: string) => id;
const viewsRow = (page: Page) => card(page).locator('css=.fp-view-menu [role=group][aria-label="Views"]');
const viewItem = (page: Page, id: string) => viewsRow(page).locator(`css=button[data-view="${id}"]`);
const openMenu = openViewMenu;
const closeMenu = async (page: Page) => {
  const t = card(page).locator('button[aria-label="View options"]');
  if ((await t.getAttribute("aria-expanded")) === "true") await t.click();
};
/** A real click on a saved view, opening the popover first as a viewer does. */
const pick = async (page: Page, id: string) => {
  await openMenu(page);
  await viewItem(page, id).click();
};
const resetView = (page: Page) => card(page).locator('button[aria-label="Reset view"]').click();
const modeOf = (page: Page) => viewControl(page).inputValue();

async function boot(page: Page, config: Record<string, unknown>, layout: unknown = withViews(VIEWS), fresh = true) {
  await page.setViewportSize({ width: 1100, height: 900 });
  if (fresh) await page.goto(URL_);
  await page.addScriptTag({ content: CARD_JS, type: "module" });
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([c, l]) => {
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig({ type: "custom:floorplan-studio-card", layout: l, ...(c as object) });
      el.hass = { states: {}, themes: { darkMode: false } };
      return el.updateComplete;
    },
    [config, layout] as const,
  );
}

test.describe("S33.8 saved views in the card", () => {
  test("the Views row lists each view of the layout as a toggle button, names as text", async ({ page }) => {
    const bad = [{ id: "view-x", name: '"><script>window.__x=1</script>', floor: "ground" }];
    await boot(page, { view: "2d" }, withViews(bad));
    await openMenu(page);
    const item = viewItem(page, view("view-x"));
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute("aria-pressed", "false");
    await expect(item).toContainText('"><script>window.__x=1</script>');
    expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
    await expect(viewsRow(page)).toHaveCount(1);
  });

  test("the Views row is laid out as a labelled column in the popover (computed-style pair of the .fp-vm-views rule)", async ({
    page,
  }) => {
    await boot(page, { view: "2d" });
    await openMenu(page);
    const row = viewsRow(page);
    const css = await row.evaluate((el) => {
      const c = getComputedStyle(el),
        b = el.querySelector("button")!,
        bc = getComputedStyle(b);
      const m = el.closest(".fp-view-menu")!;
      return {
        display: c.display,
        dir: c.flexDirection,
        label: el.querySelector("span")!.textContent,
        labelColor: getComputedStyle(el.querySelector("span")!).color,
        ink: c.color,
        buttonW: b.getBoundingClientRect().width,
        rowW: el.getBoundingClientRect().width,
        buttonFont: bc.fontSize,
        inMenu: m.contains(el),
      };
    });
    expect(css.display).toBe("flex");
    expect(css.dir).toBe("column");
    expect(css.label).toBe("Views");
    expect(css.labelColor).toBe(css.ink);
    expect(css.buttonW).toBeGreaterThan(css.rowW - 2); // a full-width button, as every button of the popover
    expect(css.buttonFont).toBe("14px");
    expect(css.inMenu).toBe(true);
  });

  test("a layout with no views has no Views row", async ({ page }) => {
    await boot(page, { view: "2d" }, structuredClone(demo));
    await openMenu(page);
    await expect(viewsRow(page)).toHaveCount(0);
  });

  test("a real click on a view switches floor and zooms to the ratio against the card's fit, centred; reload keeps it; Reset view returns to the config", async ({
    page,
  }) => {
    await boot(page, { view: "2d" });
    await chip(page, "First").click();
    const fit = await viewBox(page); // the first floor, whole: the card's own fit
    await chip(page, "Ground").click();
    expect(await shownFloor(page)).toBe("Ground");
    await pick(page, view("view-bed-close"));
    await settled(page);
    expect(await shownFloor(page)).toBe("First");
    const b = await viewBox(page);
    expect(b[2]!).toBeCloseTo(fit[2]! / 3, 1);
    expect(b[3]!).toBeCloseTo(fit[3]! / 3, 1);
    expect(b[0]! + b[2]! / 2).toBeCloseTo(120, 0);
    expect(b[1]! + b[3]! / 2).toBeCloseTo(90, 0);
    // a real reload keeps it
    await page.reload();
    await boot(page, { view: "2d" }, withViews(VIEWS), false);
    await settled(page);
    const again = await viewBox(page);
    for (let i = 0; i < 4; i++) expect(again[i]!).toBeCloseTo(b[i]!, 1);
    await resetView(page);
    await settled(page);
    const home = await viewBox(page);
    for (let i = 0; i < 4; i++) expect(home[i]!).toBeCloseTo(fit[i]!, 1);
  });

  test("a view with a turn and a mode applies both; a view with no rotation turns the plan back to 0", async ({
    page,
  }) => {
    await boot(page, { view: "2d" });
    await pick(page, view("view-turned"));
    await settled(page);
    expect(await planDeg(page)).toBe(90);
    expect(await modeOf(page)).toBe("2.5d");
    await pick(page, view("view-bed-close")); // no rotation, no mode: turned 0, the mode stays the viewer's
    await settled(page);
    expect(await planDeg(page)).toBe(0);
    expect(await modeOf(page)).toBe("2.5d");
  });

  test("the applied view is the checked one; picking a floor chip clears it", async ({ page }) => {
    await boot(page, { view: "2d" });
    await pick(page, view("view-bed-close"));
    await settled(page);
    await openMenu(page);
    await expect(viewItem(page, view("view-bed-close"))).toHaveAttribute("aria-pressed", "true");
    await expect(viewItem(page, view("view-turned"))).toHaveAttribute("aria-pressed", "false");
    await closeMenu(page);
    await chip(page, "Ground").click();
    await openMenu(page);
    await expect(viewItem(page, view("view-bed-close"))).toHaveAttribute("aria-pressed", "false");
  });

  test("a view on a floor the card's `floors` leaves out is not offered; one on a listed floor is", async ({
    page,
  }) => {
    await boot(page, { view: "2d", floors: ["ground", "first"] });
    await openMenu(page);
    await expect(viewItem(page, view("view-test-room"))).toHaveCount(0);
    await expect(viewItem(page, view("view-bed-close"))).toHaveCount(1);
  });

  test("a card pinned to one floor offers that floor's views only", async ({ page }) => {
    await boot(page, { view: "2d", floor: "first" });
    await openMenu(page);
    await expect(viewItem(page, view("view-bed-close"))).toHaveCount(1);
    await expect(viewItem(page, view("view-turned"))).toHaveCount(0);
  });

  test("a view id that is a View mode (2d) is not offered: the mode keeps its own button", async ({ page }) => {
    await boot(page, { view: "2d" });
    await openMenu(page);
    await expect(viewItem(page, "2d")).toHaveCount(0);
    await expect(viewsRow(page).locator("css=button")).toHaveCount(VIEWS.length - 1); // the other four, not the clashing one
    await expect(viewControl(page).group.getByRole("button", { name: "2D", exact: true })).toHaveCount(1); // the mode keeps its own button
  });

  test("a hass update keeps the applied view", async ({ page }) => {
    await boot(page, { view: "2d" });
    await pick(page, view("view-bed-close"));
    await settled(page);
    const before = await viewBox(page);
    await page.evaluate(() => {
      const el = document.getElementById("card") as unknown as { hass: unknown; updateComplete: Promise<unknown> };
      el.hass = {
        states: { "light.x": { state: "on", attributes: {}, last_changed: "2026-10-04T09:30:15Z" } },
        themes: { darkMode: false },
      };
      return el.updateComplete;
    });
    expect(await shownFloor(page)).toBe("First");
    const after = await viewBox(page);
    for (let i = 0; i < 4; i++) expect(after[i]!).toBeCloseTo(before[i]!, 2);
    await openMenu(page);
    await expect(viewItem(page, view("view-bed-close"))).toHaveAttribute("aria-pressed", "true");
  });

  test("view_switch: false and kiosk draw no View options, so no Views row", async ({ page }) => {
    await boot(page, { view: "2d", view_switch: false });
    await expect(card(page).locator('button[aria-label="View options"]')).toHaveCount(0);
    await expect(viewsRow(page)).toHaveCount(0);
    await boot(page, { view: "2d", kiosk: true });
    await expect(card(page).locator('button[aria-label="View options"]')).toHaveCount(0);
    await expect(viewsRow(page)).toHaveCount(0);
  });

  test("in 3D a view picks its floor and mode and keeps the framed camera (no zoom, no centre)", async ({ page }) => {
    await open3d(page, { layout: withViews(VIEWS), view: "3d" });
    await expect(holder(page)).toBeVisible();
    await drawn(page);
    await pick(page, view("view-bed-close"));
    await expect
      .poll(() =>
        card3d(page).evaluate(
          (el) =>
            [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".fp-floors button")]
              .find((b) => b.getAttribute("aria-pressed") === "true")
              ?.textContent?.trim()
              .split(" ")[0],
        ),
      )
      .toBe("First");
    await expect(holder(page)).toBeVisible(); // still 3D
    await drawn(page);
    expect(await modeOf(page)).toBe("3d");
  });

  test("a view whose mode is 3d switches a 2D card to 3D", async ({ page }) => {
    await open3d(page, { layout: withViews(VIEWS), view: "2d" });
    await expect(holder(page)).toHaveCount(0);
    await pick(page, view("view-3d"));
    await expect(holder(page)).toBeVisible();
    await configure3d(page, { layout: withViews(VIEWS), view: "2d" }); // setConfig again: the pick stays
    await expect(holder(page)).toBeVisible();
  });
});
