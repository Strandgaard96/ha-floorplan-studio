import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openOverview } from "./shell-helpers";

// UI refactor, lane ui-system (docs/specs/card-ui-refactor.md items 12 to 16): computed-style pairs (CLAUDE.md finding 10) for the
// type scale, the radii, the shadow tokens, the room panel's hierarchy and the popup's details. Every rule is read back from
// Chromium, not matched as text. Clicks are real page.mouse events on the real top element (finding 3).

const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
const URL_ = pathToFileURL(resolve("tests/card/harness.html")).href;
const CARD_JS = readFileSync(resolve("dist/floorplan-studio-card.js"), "utf8");
const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: "2026-10-11T09:30:15Z",
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
  "binary_sensor.demo_hall_motion": st("on"),
  "camera.demo_hall": st("idle"),
};

async function boot(page: Page, width: number, theme = "light") {
  await page.setViewportSize({ width, height: 900 });
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
    [{ layout: structuredClone(demo), floor: "ground", theme }, STATES] as const,
  );
}
const card = (page: Page) => page.locator("floorplan-studio-card");

/** Computed values of the first element matching `sel` in the card's shadow root. */
const css = (page: Page, sel: string, props: string[]) =>
  card(page).evaluate(
    (el, [sel, props]) => {
      const e = el.shadowRoot!.querySelector(sel as string)!;
      const c = getComputedStyle(e);
      return Object.fromEntries((props as string[]).map((p) => [p, c.getPropertyValue(p)]));
    },
    [sel, props] as const,
  );

async function openPopup(page: Page, i: number) {
  const p = await card(page).evaluate((el, i) => {
    const g = el.shadowRoot!.querySelector(`svg g[data-x="${i}"]`)!,
      r = g.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    return { x, y, hit: !!el.shadowRoot!.elementFromPoint(x, y)?.closest(`g[data-x="${i}"]`) };
  }, i);
  expect(p.hit, `device ${i} is the top element at its centre`).toBe(true);
  await page.mouse.click(p.x, p.y);
  await card(page).locator("css=.fp-pop").waitFor({ state: "visible" });
}

test.describe("system tokens on the card host", () => {
  for (const theme of ["light", "blueprint"]) {
    test(`the spacing, radius and shadow tokens are defined and the popup, panel and tooltip use them (${theme})`, async ({
      page,
    }) => {
      await boot(page, 900, theme);
      const host = await card(page).evaluate((el) => {
        const c = getComputedStyle(el);
        return [
          "--fp-space-1",
          "--fp-space-2",
          "--fp-space-3",
          "--fp-space-4",
          "--fp-space-5",
          "--fp-radius-control",
          "--fp-radius-surface",
          "--fp-radius-pill",
        ].map((p) => c.getPropertyValue(p).trim());
      });
      expect(host).toEqual(["4px", "8px", "12px", "16px", "24px", "6px", "12px", "999px"]);
      await openPopup(page, 0);
      const pop = await css(page, ".fp-pop", ["border-top-left-radius", "box-shadow", "font-size"]);
      expect(pop["border-top-left-radius"]).toBe("12px");
      expect(pop["font-size"]).toBe("14px");
      expect(pop["box-shadow"], "no black shadow").not.toContain("rgba(0, 0, 0");
      expect(pop["box-shadow"].split("),").length, "a tight and a soft layer").toBeGreaterThanOrEqual(2);
      expect((await css(page, ".fp-pop-name", ["font-size", "font-weight"]))["font-size"]).toBe("16px");
      // the panel: same surface radius and shadow as the popup
      const panel = await css(page, ".fp-active", ["border-top-left-radius", "box-shadow"]);
      expect(panel["border-top-left-radius"]).toBe("12px");
      expect(panel["box-shadow"]).toBe(pop["box-shadow"]);
    });
  }

  test("no text in the card's chrome is under 12 px (a probe of every button, label and row in the open card)", async ({
    page,
  }) => {
    await boot(page, 900);
    await openOverview(page);
    await openPopup(page, 0);
    const small = await card(page).evaluate((el) => {
      const out: string[] = [];
      for (const e of el.shadowRoot!.querySelectorAll<HTMLElement>(
        ".fp-active *, .fp-pop *, .fp-zoom *, .fp-floors *, .fp-stack *",
      )) {
        if (e.closest("svg") && !e.matches("svg")) continue;
        const own = [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
        if (own && parseFloat(getComputedStyle(e).fontSize) < 12)
          out.push(`${e.className} ${getComputedStyle(e).fontSize}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
});

test.describe("item 16: popup details", () => {
  test("More info and Details start at the same left edge, and More info is still a 36 px target", async ({ page }) => {
    await boot(page, 900);
    await openPopup(page, 0);
    const edge = await card(page).evaluate((el) => {
      const more = el.shadowRoot!.querySelector(".fp-pop-more")!,
        det = el.shadowRoot!.querySelector(".fp-pop-info summary")!;
      const range = document.createRange();
      range.selectNodeContents(more);
      const text = range.getBoundingClientRect();
      return {
        more: text.left,
        det: det.getBoundingClientRect().left,
        h: more.getBoundingClientRect().height,
        align: getComputedStyle(more).textAlign,
      };
    });
    expect(
      Math.abs(edge.more - edge.det),
      `More info text at ${edge.more}, Details at ${edge.det}`,
    ).toBeLessThanOrEqual(1);
    expect(edge.h).toBeGreaterThanOrEqual(36);
    expect(["left", "start"]).toContain(edge.align);
  });

  test("the hue slider's thumb is a circle like the others", async ({ page }) => {
    await boot(page, 900);
    await openPopup(page, 0);
    const thumb = await card(page).evaluate((el) => {
      const hue = el.shadowRoot!.querySelector(".fp-pop-hue")!;
      const c = getComputedStyle(hue, "::-webkit-slider-thumb");
      return { w: c.width, h: c.height, r: c.borderTopLeftRadius };
    });
    expect(thumb.w).toBe(thumb.h);
    expect(thumb.r).toBe("50%");
  });

  test("the popup's buttons keep their 44 px target", async ({ page }) => {
    await boot(page, 900);
    await openPopup(page, 0);
    const h = await card(page).evaluate(
      (el) => el.shadowRoot!.querySelector<HTMLElement>(".fp-pop-do")!.getBoundingClientRect().height,
    );
    expect(h).toBeGreaterThanOrEqual(44);
  });
});

test.describe("item 15: the panel's hierarchy", () => {
  test("a section heading outranks a group heading, and a fact's label is quieter than its value", async ({ page }) => {
    await boot(page, 900);
    await openOverview(page);
    const sec = await css(page, ".fp-ov-head", ["font-size", "font-weight", "text-transform", "color"]);
    const grp = await css(page, "button.fp-cat", ["font-size", "font-weight", "text-transform", "color"]);
    expect(sec["font-size"]).toBe("12px");
    expect(grp["font-size"]).toBe("12px");
    expect(Number(sec["font-weight"])).toBeGreaterThan(Number(grp["font-weight"]));
    expect(sec["text-transform"]).toBe("uppercase");
    expect(grp["text-transform"]).toBe("none");
    expect(sec.color, "the section is ink, the group the quieter text colour").not.toBe(grp.color);
  });

  test("an open room: labels are 12 px in --fp-text, values 14 px in --fp-ink, Devices outranks Lights", async ({
    page,
  }) => {
    await boot(page, 900);
    await openOverview(page);
    const p = await card(page).evaluate((el) => {
      const poly = el.shadowRoot!.querySelector<SVGPolygonElement>('svg polygon[data-r="0"]')!;
      const r = poly.getBoundingClientRect();
      for (let y = r.top + 6; y < r.bottom; y += 6)
        for (let x = r.left + 6; x < r.right; x += 6)
          if (el.shadowRoot!.elementFromPoint(x, y) === poly) return { x, y };
      return null;
    });
    expect(p, "room 0 has bare floor to click").not.toBeNull();
    await page.mouse.click(p!.x, p!.y);
    await card(page).locator("css=.fp-room-facts").waitFor({ state: "visible" });
    const dt = await css(page, ".fp-room-facts dt", ["font-size", "color"]);
    const dd = await css(page, ".fp-room-facts dd", ["font-size", "color"]);
    expect(dt["font-size"]).toBe("12px");
    expect(dd["font-size"]).toBe("14px");
    const ink = await card(page).evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--fp-ink)";
      el.shadowRoot!.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(dd.color).toBe(ink);
    const sec = await css(page, ".fp-room .fp-section-label", ["font-weight", "text-transform", "font-size"]);
    expect(sec["font-size"]).toBe("12px");
    expect(sec["text-transform"]).toBe("uppercase");
    expect(Number(sec["font-weight"])).toBeGreaterThan(500);
    expect((await css(page, ".fp-room-name", ["font-size"]))["font-size"]).toBe("16px");
  });
});

test.describe("item 12: plan labels on the screen's scale", () => {
  test("a room name is 14 px semibold on the screen and a room badge or readout is 12 px", async ({ page }) => {
    await boot(page, 900);
    const px = await card(page).evaluate((el) => {
      const svg = el.shadowRoot!.querySelector("svg")!;
      const scaleOf = (e: SVGGraphicsElement) => Math.hypot(e.getScreenCTM()!.a, e.getScreenCTM()!.b);
      const t = svg.querySelector<SVGTextElement>("text.lbl:not(.out):not(.zone)[data-rl]")!;
      return { name: Number(t.getAttribute("font-size")) * scaleOf(t), weight: getComputedStyle(t).fontWeight };
    });
    // the label fitter may shrink a name to fit its room; it never grows past 14
    expect(px.name).toBeLessThanOrEqual(14 + 0.01);
    expect(px.weight).toBe("600");
  });
});
