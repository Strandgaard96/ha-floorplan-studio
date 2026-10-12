import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// S14.6 (docs/specs/card-polish-and-light.md, item 12): the Active list and the Room panel group their rows by category,
// each category a header button that folds it, remembered per card. Clicks are real page.mouse events at the header's
// centre, checked to be the real top element there (CLAUDE.md finding 3).

const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
const URL_ = pathToFileURL(resolve("tests/card/harness.html")).href;
const CARD_JS = readFileSync(resolve("dist/floorplan-studio-card.js"), "utf8");

const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: "2026-10-04T09:30:15Z",
});
const STATES = () => ({
  "light.demo_living": st("on", { friendly_name: "Living light", supported_color_modes: ["onoff"] }),
  "light.demo_kitchen": st("on", { supported_color_modes: ["onoff"] }),
  "switch.demo_hall": st("off"),
  "switch.demo_tv_plug": st("on"),
  "sensor.demo_living_temperature": st("21.5", { unit_of_measurement: "°C" }),
  "climate.demo_living": st("heat"),
  "camera.demo_hall": st("idle"),
  // S24.3: a camera is no longer listed, so the hall motion sensor is what fills the Security group these tests fold.
  "binary_sensor.demo_hall_motion": st("on"),
});

async function boot(page: Page, width: number, extra: Record<string, unknown> = {}, fresh = true) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(URL_);
  if (fresh)
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        /* none */
      }
    });
  await page.addScriptTag({ content: CARD_JS, type: "module" });
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, states]) => {
      const w = window as unknown as { __calls: string[] };
      w.__calls = [];
      const el = document.getElementById("card") as unknown as HTMLElement & {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = {
        states,
        callService: (d: string, s: string) => {
          w.__calls.push(`${d}.${s}`);
        },
      };
      return el.updateComplete;
    },
    [{ layout: structuredClone(demo), floor: "ground", ...extra }, STATES()] as const,
  );
  // below 480 px the list starts folded: open it, as a person would
  const collapse = card(page).locator("css=.fp-active-collapse");
  if ((await collapse.getAttribute("aria-expanded")) === "false") await collapse.click();
}
const card = (page: Page) => page.locator("floorplan-studio-card");
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
const names = (page: Page) =>
  card(page).locator("css=.fp-active-body .fp-ov-act > .fp-active-group .fp-cat-name").allTextContents();

/** A real click at the header's centre, after checking that the header is the top element there. */
async function clickHead(page: Page, cat: string, list = ".fp-active-body .fp-ov-act > .fp-active-group") {
  const p = await card(page).evaluate((el, sel) => {
    const b = el.shadowRoot!.querySelector<HTMLElement>(sel)!;
    b.scrollIntoView({ block: "nearest" });
    const r = b.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    return { x, y, hit: el.shadowRoot!.elementFromPoint(x, y)?.closest("button.fp-cat") === b };
  }, `${list}[data-cat="${cat}"] > button.fp-cat`);
  expect(p.hit, `the ${cat} header is the top element at its centre`).toBe(true);
  await page.mouse.click(p.x, p.y);
}
const rowsIn = (page: Page, cat: string, list = ".fp-active-body .fp-ov-act > .fp-active-group") =>
  card(page).locator(`css=${list}[data-cat="${cat}"] .fp-active-row`).count();
const expanded = (page: Page, cat: string, list = ".fp-active-body .fp-ov-act > .fp-active-group") =>
  card(page).locator(`css=${list}[data-cat="${cat}"] > button.fp-cat`).getAttribute("aria-expanded");

for (const width of [1100, 375]) {
  for (const theme of ["light", "midnight"]) {
    test.describe(`categories at ${width} px, theme ${theme}`, () => {
      test("the Active list is ordered by category; a real click folds one group and a second opens it", async ({
        page,
      }) => {
        await boot(page, width, { theme });
        // the demo lists the plug (power) before the motion sensor (security); the fixed category order puts lights, security, power
        const got = await names(page);
        expect(got.slice(0, 3)).toEqual(["Lights", "Security", "Power"]);
        expect(await rowsIn(page, "lights")).toBe(2);
        await clickHead(page, "lights");
        expect(await expanded(page, "lights")).toBe("false");
        expect(await rowsIn(page, "lights")).toBe(0);
        expect(await rowsIn(page, "security"), "the other groups stay open").toBeGreaterThan(0);
        await clickHead(page, "lights");
        expect(await expanded(page, "lights")).toBe("true");
        expect(await rowsIn(page, "lights")).toBe(2);
      });

      test("the fold is remembered after a reload", async ({ page }) => {
        await boot(page, width, { theme });
        await clickHead(page, "security");
        expect(await expanded(page, "security")).toBe("false");
        await boot(page, width, { theme }, false);
        expect(await expanded(page, "security")).toBe("false");
        expect(await expanded(page, "lights")).toBe("true");
      });

      test("a header works from the keyboard: Enter folds, Space opens, and it is a button with aria-expanded", async ({
        page,
      }) => {
        await boot(page, width, { theme });
        const head = card(page).locator('css=.fp-active-group[data-cat="security"] > button.fp-cat');
        expect(await head.evaluate((b) => b.tagName)).toBe("BUTTON");
        await head.focus();
        await page.keyboard.press("Enter");
        expect(await expanded(page, "security")).toBe("false");
        await page.keyboard.press("Space");
        expect(await expanded(page, "security")).toBe("true");
      });

      test("a row inside a group still opens the popup and operates nothing", async ({ page }) => {
        await boot(page, width, { theme });
        await card(page).locator("css=.fp-active-row", { hasText: "Living light" }).click();
        await expect(card(page).locator("css=.fp-pop")).toHaveAttribute("aria-label", "Living light");
        expect(await calls(page)).toEqual([]);
      });

      test("the header looks like a label, not a browser button, and fits the panel (computed style pair)", async ({
        page,
      }) => {
        await boot(page, width, { theme });
        const s = await card(page)
          .locator('css=.fp-active-group[data-cat="lights"] > button.fp-cat')
          .evaluate((b) => {
            const cs = getComputedStyle(b),
              panel = getComputedStyle(b.closest(".fp-active")!),
              body = b.closest(".fp-active-body") as HTMLElement;
            const r = b.getBoundingClientRect();
            return {
              size: cs.fontSize,
              border: cs.borderTopStyle,
              bg: cs.backgroundColor,
              cursor: cs.cursor,
              color: cs.color,
              panelBg: panel.backgroundColor,
              h: r.height,
              overflow: body.scrollWidth > body.clientWidth,
            };
          });
        expect(s.size).toBe("12px"); // UI refactor 12 and 15: a group heading is 12 px
        expect(s.border).toBe("none");
        expect(s.bg).toBe("rgba(0, 0, 0, 0)");
        expect(s.cursor).toBe("pointer");
        expect(s.color, "label colour reads against the panel").not.toBe(s.panelBg);
        expect(s.h).toBeGreaterThanOrEqual(28);
        expect(s.overflow).toBe(false);
      });
    });
  }
}

test.describe("the Room panel is grouped too", () => {
  for (const width of [1100, 375]) {
    test(`at ${width} px a picked room lists its devices by category and folds them apart from the Active list`, async ({
      page,
    }) => {
      await boot(page, width);
      const p = await card(page).evaluate((el) => {
        const poly = el.shadowRoot!.querySelector<SVGPolygonElement>('svg polygon[data-r="0"]')!;
        const r = poly.getBoundingClientRect();
        for (let y = r.top + 6; y < r.bottom; y += 6)
          for (let x = r.left + 6; x < r.right; x += 6) {
            if (x > window.innerWidth || y > window.innerHeight) continue;
            if (el.shadowRoot!.elementFromPoint(x, y) === poly) return { x, y };
          }
        return null;
      });
      expect(p).not.toBeNull();
      await page.mouse.click(p!.x, p!.y);
      const room = ".fp-room-devices > .fp-active-group";
      const cats = await card(page).locator(`css=${room} .fp-cat-name`).allTextContents();
      expect(cats.length).toBeGreaterThan(1);
      expect(cats[0]).toBe("Lights");
      const before = await rowsIn(page, "lights", room);
      expect(before).toBeGreaterThan(0);
      await clickHead(page, "lights", room);
      expect(await rowsIn(page, "lights", room)).toBe(0);
      expect(await expanded(page, "lights", room)).toBe("false");
      // the Active list below shows the same category, and it is still open: the two lists fold apart
      // (the phone sheet has no Active list: its devices are the Devices list, see "the room sheet on a phone" below)
      if (width > 480)
        expect(await expanded(page, "lights", ".fp-filtered .fp-ov-act > .fp-active-group")).toBe("true");
    });
  }
});

// Phone sheet fix (2026-10-12): below 480 px the room panel is a short sheet (45 % of the card). A room with nine lights and
// a motion sensor held 1140 px in a 235 px window, with the Security header 900 px down, so with Lights open nobody could reach
// the motion sensor. In the sheet the device groups are an accordion and the duplicate "Active here" list is not drawn.
test.describe("the room sheet on a phone", () => {
  test.use({ hasTouch: true });

  /** The demo ground floor padded with eight lights and a motion sensor in room 0, the room opened, the card 640 px high. */
  async function bootPadded(page: Page, width: number) {
    const layout = structuredClone(demo);
    const states: Record<string, unknown> = STATES();
    for (let i = 0; i < 8; i++) {
      layout.floors.ground.devices.push({
        id: `l${i}`,
        type: "light",
        entity: `light.x${i}`,
        name: `Lamp ${i}`,
        x: 200 + i * 10,
        y: 220,
      });
      states[`light.x${i}`] = st(i % 2 ? "on" : "off");
    }
    layout.floors.ground.devices.push({
      id: "mot2",
      type: "motion",
      entity: "binary_sensor.m2",
      name: "Living motion",
      x: 260,
      y: 230,
    });
    states["binary_sensor.m2"] = st("off");
    await boot(page, width, { layout });
    await page.evaluate(() => (document.getElementById("wrap")!.style.height = "640px"));
    await card(page).evaluate((el: HTMLElement & { _pickRoom(i: number): void; updateComplete: Promise<unknown> }) => {
      el._pickRoom(0);
      return el.updateComplete;
    });
    await page.waitForFunction(() =>
      document.querySelector("floorplan-studio-card")!.shadowRoot!.querySelector(".fp-active.fp-room-open"),
    );
  }
  const room = ".fp-room-devices > .fp-active-group";
  const catsOpen = (page: Page) =>
    card(page).evaluate(
      (el, sel) =>
        [...el.shadowRoot!.querySelectorAll<HTMLElement>(`${sel} > button.fp-cat`)]
          .filter((b) => b.getAttribute("aria-expanded") === "true")
          .map((b) => b.parentElement!.getAttribute("data-cat")),
      room,
    );

  /** A real touch at the header's centre, after scrolling it into the body and checking it is the top element. */
  async function tapHead(page: Page, cat: string) {
    const p = await card(page).evaluate((el, sel) => {
      const b = el.shadowRoot!.querySelector<HTMLElement>(sel)!;
      b.scrollIntoView({ block: "nearest" });
      const r = b.getBoundingClientRect(),
        x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      return { x, y, hit: el.shadowRoot!.elementFromPoint(x, y)?.closest("button.fp-cat") === b };
    }, `${room}[data-cat="${cat}"] > button.fp-cat`);
    expect(p.hit, `the ${cat} header is the top element at its centre`).toBe(true);
    await page.touchscreen.tap(p.x, p.y);
  }

  test("at 375 px opening Security folds Lights, scrolls Security to the top of the sheet and shows the motion row", async ({
    page,
  }) => {
    await bootPadded(page, 375);
    expect(await catsOpen(page)).toEqual(expect.arrayContaining(["lights", "security"]));
    // the user's state: Lights open, Security folded
    await tapHead(page, "security");
    await tapHead(page, "lights");
    await tapHead(page, "lights"); // Lights open again; accordion folds everything else
    expect(await catsOpen(page)).toEqual(["lights"]);
    await tapHead(page, "security");
    expect(await catsOpen(page)).toEqual(["security"]);
    await expect
      .poll(() =>
        card(page).evaluate((el, sel) => {
          const b = el.shadowRoot!.querySelector<HTMLElement>(sel)!;
          const body = el.shadowRoot!.querySelector<HTMLElement>(".fp-active-body")!;
          return Math.abs(b.getBoundingClientRect().top - body.getBoundingClientRect().top);
        }, `${room}[data-cat="security"] > button.fp-cat`),
      )
      .toBeLessThan(4);
    const motion = await card(page).evaluate((el) => {
      const row = [...el.shadowRoot!.querySelectorAll<HTMLElement>(".fp-room-devices .fp-active-row")].find((r) =>
        r.textContent!.includes("Living motion"),
      )!;
      const r = row.getBoundingClientRect(),
        body = el.shadowRoot!.querySelector<HTMLElement>(".fp-active-body")!.getBoundingClientRect(),
        top = el.shadowRoot!.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { inside: r.top >= body.top && r.bottom <= body.bottom, hit: !!top && row.contains(top) };
    });
    expect(motion).toEqual({ inside: true, hit: true });
    // folding just folds
    await tapHead(page, "security");
    expect(await catsOpen(page)).toEqual([]);
  });

  test("at 1100 px the groups fold independently: opening Security leaves Lights open", async ({ page }) => {
    await bootPadded(page, 1100);
    await tapHead(page, "security");
    expect(await catsOpen(page)).toEqual(expect.arrayContaining(["lights"]));
    await tapHead(page, "security");
    expect(await catsOpen(page)).toEqual(expect.arrayContaining(["lights", "security"]));
  });

  for (const [width, present] of [
    [375, false],
    [1100, true],
  ] as const) {
    test(`at ${width} px the room panel ${present ? "lists" : "does not list"} the Active here block`, async ({
      page,
    }) => {
      await bootPadded(page, width);
      expect(await card(page).locator("css=.fp-active-body .fp-filter").count()).toBe(present ? 1 : 0);
      expect(await card(page).locator("css=.fp-active-body .fp-filtered").count()).toBe(present ? 1 : 0);
    });
  }
});
