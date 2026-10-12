import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openViewMenu, viewControl } from "./shell-helpers";

// The card's rotation, its animation and its view memory in real Chromium: real mouse coordinates (CLAUDE.md
// finding 3), computed styles (finding 10), and a reload that goes through the real localStorage.

const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
const URL_ = pathToFileURL(resolve("tests/card/harness.html")).href;
const CARD_JS = readFileSync(resolve("dist/floorplan-studio-card.js"), "utf8");
const KITCHEN_LIGHT = 1; // demo/layout.json: floors.ground.devices[1], light.demo_kitchen

type Cfg = Record<string, unknown>;

async function open(page: Page) {
  await page.goto(URL_);
  await page.addScriptTag({ content: CARD_JS, type: "module" });
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
}

/** Same shape as card.spec.ts's spy: callService records onto `window.__calls`. */
async function configure(page: Page, config: Cfg) {
  await page.evaluate((config) => {
    (window as unknown as { __calls: unknown[] }).__calls = [];
    const el = document.getElementById("card") as unknown as {
      setConfig(c: unknown): void;
      hass: unknown;
      updateComplete: Promise<unknown>;
    };
    el.setConfig(config);
    el.hass = {
      states: { "light.demo_kitchen": { state: "off", attributes: {}, last_changed: new Date().toISOString() } },
      callService: (...args: unknown[]) => (window as unknown as { __calls: unknown[] }).__calls.push(args),
    };
    return el.updateComplete;
  }, config);
}

const card = (page: Page) => page.locator("floorplan-studio-card");
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);
const button = (page: Page, label: string) => card(page).locator(`css=button[aria-label="${label}"]`);
const settled = (page: Page) => expect(card(page).locator("css=svg.fp-turning")).toHaveCount(0);
const viewBox = (page: Page) =>
  card(page).evaluate((el) => el.shadowRoot!.querySelector("svg")!.getAttribute("viewBox")!.split(/\s+/).map(Number));
/** The plan's turn in degrees, read from the real DOM: 0 when there is no turned group. */
const planDeg = (page: Page) =>
  card(page).evaluate((el) => {
    const g = el.shadowRoot!.querySelector("svg g.plan-turn");
    const m = g?.getAttribute("transform")?.match(/^rotate\((-?[\d.]+)/);
    return m ? Number(m[1]) : 0;
  });
const hostTheme = (page: Page) => card(page).evaluate((el) => el.getAttribute("data-theme"));
// UI refactor 3: View is a segmented control (viewControl keeps the select's two calls); Theme and the rest are in the View options menu.
const select = (page: Page, label: string) =>
  label === "View" ? viewControl(page) : card(page).locator(`css=select[aria-label="${label}"]`);
const lightCentre = async (page: Page) => {
  const g = card(page).locator(`css=g[data-x="${KITCHEN_LIGHT}"]`);
  await g.scrollIntoViewIfNeeded(); // a turned plan is taller; the light can sit below the fold
  const box = (await g.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe("rotation: the visible turn", () => {
  test("a click turns the plan through intermediate angles and ends exactly at 45", async ({ page }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    // A sampler in the page records the plan's turn on every animation frame, so the test sees the real turn
    // instead of guessing at it with waits.
    await card(page).evaluate((el) => {
      const seen: number[] = [];
      (window as unknown as { __seen: number[] }).__seen = seen;
      const loop = () => {
        const g = el.shadowRoot!.querySelector("svg g.plan-turn");
        const m = g?.getAttribute("transform")?.match(/^rotate\((-?[\d.]+)/);
        seen.push(m ? Number(m[1]) : 0);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await button(page, "Rotate right").click();
    await settled(page);
    const seen = await page.evaluate(() => (window as unknown as { __seen: number[] }).__seen);
    const between = seen.filter((d) => d > 0.5 && d < 44.5);
    expect(between.length, `samples ${seen.join(",")}`).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]! - 1e-9);
    expect(seen.at(-1)).toBe(45);
    expect(await planDeg(page)).toBe(45);
  });

  test("the turn lands byte for byte on a direct render at 45", async ({ page }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground", rotation: 45 });
    // UI refactor 4: Reset view shows only once the view differs, and the names keep clear of the stack's height, so the turned
    // card (Reset shown) is compared with a direct one whose Reset is shown too: picking the 2D it already has does that.
    await select(page, "View").selectOption("2d");
    await expect(button(page, "Reset view")).toBeVisible();
    const direct = await card(page).evaluate((el) => el.shadowRoot!.querySelector("svg")!.outerHTML);
    await page.evaluate(() => localStorage.clear());
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    await button(page, "Rotate right").click();
    await settled(page);
    const turned = await card(page).evaluate((el) => el.shadowRoot!.querySelector("svg")!.outerHTML);
    expect(turned).toBe(direct);
  });

  test("a second click mid-turn goes on to 90 with no jump back", async ({ page }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    await button(page, "Rotate right").click();
    await expect.poll(() => planDeg(page)).toBeGreaterThan(2);
    const mid = await planDeg(page);
    await button(page, "Rotate right").click();
    expect(await planDeg(page)).toBeGreaterThanOrEqual(mid - 1e-9);
    await settled(page);
    expect(await planDeg(page)).toBe(90);
  });

  test("names stay upright: a label's own transform undoes the plan's turn", async ({ page }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground", rotation: 90 });
    const t = await card(page).evaluate((el) =>
      el.shadowRoot!.querySelector("svg text.lbl")!.getAttribute("transform"),
    );
    expect(t).toMatch(/^rotate\(-90 /);
  });

  test("prefers-reduced-motion: the plan is at 45 at once, with no frame in between", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    const seen = await card(page).evaluate(async (el) => {
      const out: number[] = [];
      const read = () => {
        const g = el.shadowRoot!.querySelector("svg g.plan-turn");
        const m = g?.getAttribute("transform")?.match(/^rotate\((-?[\d.]+)/);
        return m ? Number(m[1]) : 0;
      };
      el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')!.click();
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        out.push(read());
      }
      return out;
    });
    expect(new Set(seen)).toEqual(new Set([45]));
    await settled(page);
  });
});

test.describe("rotation: taps", () => {
  test("a tap on a light after a turn still reaches that light: its popup button makes the call (hit-test at real coordinates)", async ({
    page,
  }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    await button(page, "Rotate right").click();
    await settled(page);
    const at = await lightCentre(page);
    await page.mouse.click(at.x, at.y);
    expect(await calls(page)).toEqual([]);
    await page.locator("floorplan-studio-card").locator("css=.fp-pop-do").click();
    expect(await calls(page)).toEqual([["light", "turn_on", { entity_id: "light.demo_kitchen" }]]);
  });

  test("a tap while the plan turns is ignored; the same tap after it settles acts", async ({ page }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    const before = await lightCentre(page);
    await button(page, "Rotate right").click();
    await page.mouse.click(before.x, before.y); // where the light was a moment ago, and the plan is moving
    expect(await calls(page)).toEqual([]);
    await settled(page);
    const at = await lightCentre(page);
    await page.mouse.click(at.x, at.y);
    await page.locator("floorplan-studio-card").locator("css=.fp-pop-do").click();
    expect(await calls(page)).toEqual([["light", "turn_on", { entity_id: "light.demo_kitchen" }]]);
  });

  // CLAUDE.md finding 10: the rule is read where it lands, on the elements that carry their own pointer-events.
  test("CSS pair: while turning the plan and its devices take no pointer events, and after it they do", async ({
    page,
  }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    const read = () =>
      card(page).evaluate((el) => {
        const r = el.shadowRoot!;
        return {
          svg: getComputedStyle(r.querySelector("svg")!).pointerEvents,
          device: getComputedStyle(r.querySelector("svg g[data-x]")!).pointerEvents,
          room: getComputedStyle(r.querySelector("svg polygon[data-r], svg .room")!).pointerEvents,
        };
      });
    const idle = await read();
    expect(idle.device).not.toBe("none");
    await card(page).evaluate((el) =>
      el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')!.click(),
    );
    await expect(card(page).locator("css=svg.fp-turning")).toHaveCount(1);
    expect(await read()).toEqual({ svg: "none", device: "none", room: "none" });
    await settled(page);
    expect(await read()).toEqual(idle);
  });
});

test.describe("the card remembers its view", () => {
  const cfg = () => ({ layout: structuredClone(demo), floor: "ground" });

  async function changeEverything(page: Page) {
    await select(page, "View").selectOption("2.5d");
    await openViewMenu(page);
    await select(page, "Theme").selectOption("light");
    await button(page, "Zoom in").click();
    await button(page, "Zoom in").click();
    await button(page, "Rotate right").click();
    await settled(page);
    await button(page, "Rotate right").click();
    await settled(page);
  }

  test("zoom, focus, rotation, view and theme are back after a reload; Reset view brings the defaults back, and they stay", async ({
    page,
  }) => {
    await open(page);
    await configure(page, cfg());
    const fresh = await viewBox(page);
    const freshTheme = await hostTheme(page);
    await changeEverything(page);
    const zoomed = await viewBox(page);
    expect(zoomed[2]).toBeLessThan(fresh[2]!);

    await page.reload(); // pagehide flushes the debounced zoom save
    await page.addScriptTag({ content: CARD_JS, type: "module" });
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    await configure(page, cfg());
    const back = await viewBox(page);
    for (let i = 0; i < 4; i++) expect(back[i]!).toBeCloseTo(zoomed[i]!, 2);
    expect(await planDeg(page)).toBe(90);
    expect(await select(page, "View").inputValue()).toBe("2.5d");
    await openViewMenu(page);
    expect(await select(page, "Theme").inputValue()).toBe("light");
    expect(await hostTheme(page)).toBe("light");
    expect(await card(page).evaluate((el) => !!el.shadowRoot!.querySelector("svg .ws"))).toBe(true); // 2.5D walls are drawn

    await button(page, "Reset view").click();
    await settled(page);
    expect(await planDeg(page)).toBe(0);
    expect(await select(page, "View").inputValue()).toBe("2d");
    expect(await hostTheme(page)).toBe(freshTheme);
    const reset = await viewBox(page);
    for (let i = 0; i < 4; i++) expect(reset[i]!).toBeCloseTo(fresh[i]!, 2);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("fp-view:")))).toEqual([]);

    await page.reload();
    await page.addScriptTag({ content: CARD_JS, type: "module" });
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    await configure(page, cfg());
    expect(await planDeg(page)).toBe(0);
    expect(await hostTheme(page)).toBe(freshTheme);
  });

  test("there is no flash of the default: the first frame after a reload is already the remembered one", async ({
    page,
  }) => {
    await open(page);
    await configure(page, cfg());
    await button(page, "Rotate right").click();
    await settled(page);
    await openViewMenu(page);
    await select(page, "Theme").selectOption("terminal");
    await page.reload();
    await page.addScriptTag({ content: CARD_JS, type: "module" });
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    // setConfig and the first render in one task: whatever the card drew first is what MutationObserver saw first.
    const first = await page.evaluate(async (config) => {
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
        shadowRoot: ShadowRoot;
      };
      const seen: { deg: string | null; theme: string | null }[] = [];
      new MutationObserver(() => {
        const g = el.shadowRoot.querySelector("svg g.plan-turn");
        seen.push({
          deg: g?.getAttribute("transform")?.slice(0, 10) ?? null,
          theme: (el as unknown as Element).getAttribute("data-theme"),
        });
      }).observe(el.shadowRoot, { subtree: true, childList: true, attributes: true });
      el.setConfig(config);
      el.hass = { states: {} };
      await el.updateComplete;
      return seen.filter((s) => s.deg !== null || s.theme !== null)[0];
    }, cfg());
    expect(first?.deg).toBe("rotate(45 ");
  });

  test("a second card on the same page with another floor does not share the memory", async ({ page }) => {
    await open(page);
    await configure(page, cfg());
    await button(page, "Rotate right").click();
    await settled(page);
    await configure(page, { ...cfg(), floor: "first" }); // another card to the memory
    expect(await planDeg(page)).toBe(0);
    await configure(page, cfg());
    expect(await planDeg(page)).toBe(45);
  });
});

test.describe("toolbar", () => {
  // Opus review of ui-review-1, defect 2: the menu swapped templates, so the focused toggle was destroyed, focus fell to
  // <body>, and with the pointer off the card no key reached it again (Escape could not close the menu).
  test("View options keeps keyboard focus: Enter opens, focus stays on it, Escape closes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground" });
    await page.mouse.move(0, 799);
    const toggle = card(page).locator('css=.fp-zoom button[aria-label="View options"]');
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await card(page).evaluate((el) => el.shadowRoot!.activeElement?.getAttribute("aria-label") ?? null)).toBe(
      "View options",
    );
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await card(page).locator('css=.fp-zoom button[aria-label="View options"]').focus();
    await page.keyboard.press("Enter");
    await card(page).locator('css=.fp-zoom select[aria-label="Theme"]').focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await card(page).evaluate((el) => el.shadowRoot!.activeElement?.getAttribute("aria-label") ?? null)).toBe(
      "View options",
    );
  });

  // Opus review CSS pair (findings 10, 18): an on toggle wears the primary ring; an off one is not dimmed like a disabled one.
  test("a toolbar toggle that is on has the primary border; off, it is full opacity with the plain border", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground", theme: "light" });
    await openViewMenu(page); // UI refactor 3: Device names is in the View options menu
    const names = card(page).locator('css=.fp-zoom button[aria-label="Device names"]');
    const look = () =>
      names.evaluate((b) => ({
        border: getComputedStyle(b).borderTopColor,
        opacity: getComputedStyle(b).opacity,
        pressed: b.getAttribute("aria-pressed"),
      }));
    const primary = await card(page).evaluate((el) => {
      const p = document.createElement("i");
      p.style.color = "var(--fp-primary)";
      el.shadowRoot!.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    });
    if ((await look()).pressed !== "true") await names.click();
    const on = await look();
    expect(on.border).toBe(primary);
    await names.click();
    const off = await look();
    expect(off.pressed).toBe("false");
    expect(off.opacity).toBe("1");
    expect(off.border).not.toBe(primary);
  });

  test("view_switch: false hides the View controls (theme, labels, names) but keeps the zoom, rotate and reset buttons (Diego, 0.12.22)", async ({
    page,
  }) => {
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground", view_switch: false });
    await expect(card(page).locator(`css=select[aria-label="Theme"]`)).toHaveCount(0);
    for (const l of ["Labels", "Device names"]) await expect(button(page, l)).toHaveCount(0);
    for (const l of ["Zoom in", "Rotate left", "Rotate right", "Reset view"])
      await expect(button(page, l)).toHaveCount(1);
  });

  test("rotate_switch: false and kiosk hide rotate and reset", async ({ page }) => {
    for (const cfg of [{ rotate_switch: false, view_switch: false }, { kiosk: true }]) {
      await open(page);
      await configure(page, { layout: structuredClone(demo), floor: "ground", ...cfg });
      for (const l of ["Rotate left", "Rotate right", "Reset view"])
        await expect(button(page, l), JSON.stringify(cfg)).toHaveCount(0);
    }
  });

  test("on a 375 px card the toolbar stays inside the card and clear of the card's edges", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page);
    await configure(page, { layout: structuredClone(demo), floor: "ground", view: "2.5d" });
    const r = await card(page).evaluate((el) => {
      const host = el.getBoundingClientRect();
      const bar = el.shadowRoot!.querySelector(".fp-zoom")!.getBoundingClientRect();
      const kids = [...el.shadowRoot!.querySelectorAll(".fp-zoom > *")].map((k) => k.getBoundingClientRect());
      return {
        host: { l: host.left, r: host.right },
        bar: { l: bar.left, r: bar.right },
        kids: kids.map((k) => ({ l: k.left, r: k.right })),
      };
    });
    expect(r.bar.l).toBeGreaterThanOrEqual(r.host.l);
    expect(r.bar.r).toBeLessThanOrEqual(r.host.r);
    for (const k of r.kids) {
      expect(k.l).toBeGreaterThanOrEqual(r.host.l);
      expect(k.r).toBeLessThanOrEqual(r.host.r);
    }
  });

  // UI refactor 3: the menu is there at every width (it used to be below 480 px only), and it stays clear of the control stack
  // and inside the card. (The old premise, a wrapped toolbar, is gone: the toolbar is one row.)
  for (const width of [1280, 375]) {
    test(`at ${width} px the look controls are behind View options; opened, the menu is inside the card and clear of the stack`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      await configure(page, { layout: structuredClone(demo), floor: "ground", view: "2.5d" });
      const toggle = card(page).locator('css=.fp-zoom button[aria-label="View options"]');
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(card(page).locator('css=.fp-zoom select[aria-label="Theme"]')).toHaveCount(0);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(card(page).locator('css=.fp-zoom select[aria-label="Theme"]')).toHaveCount(1);
      const r = await card(page).evaluate((el) => {
        const host = el.getBoundingClientRect();
        const m = el.shadowRoot!.querySelector(".fp-view-menu")!.getBoundingClientRect();
        const stack = el.shadowRoot!.querySelector(".fp-stack")!.getBoundingClientRect();
        return {
          host,
          m,
          stack,
          hit: el
            .shadowRoot!.elementFromPoint(stack.x + stack.width / 2, stack.y + 14)
            ?.closest("button")
            ?.getAttribute("aria-label"),
        };
      });
      expect(r.m.left).toBeGreaterThanOrEqual(r.host.left);
      expect(r.m.right).toBeLessThanOrEqual(r.stack.left);
      expect(r.hit, "the first stack button is still the top element under an open menu").toBe("Zoom in");
    });
  }
});
