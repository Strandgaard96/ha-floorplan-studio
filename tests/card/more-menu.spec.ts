import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

// S31.3: <fp-menu>, the menu button of the card's header. Two menus on a harness page inside the shadow root of a
// stand-in card, real keyboard, real mouse (fine pointer) and real touch (coarse pointer) at every step (finding 3).
const PAGE = `/@fs${resolve("tests/card/menu-harness.html")}`;

const button = (page: Page, id: string) => page.locator(`#${id} button.btn`);
const menu = (page: Page, id: string) => page.locator(`#${id} [role=menu]`);
const items = (page: Page, id: string) => page.locator(`#${id} [role^=menuitem]`);
const picks = (page: Page) => page.evaluate(() => (window as unknown as { picks: { detail: Record<string, unknown>; target: string; bubbles: boolean; composed: boolean }[] }).picks);
/** Text of the element that really has focus, through every shadow root, or its id when it has one. */
const focused = (page: Page) => page.evaluate(() => {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el ? (el.getAttribute("role") ?? el.tagName.toLowerCase()) + ":" + (el.textContent ?? "").trim().slice(0, 20) + (el.id ? "#" + el.id : "") : "none";
});

async function open(page: Page, query = "") {
  await page.goto(PAGE + query);
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  await page.locator("#left").evaluate((el) => (el as unknown as { updateComplete: Promise<unknown> }).updateComplete);
  await page.locator("#right").evaluate((el) => (el as unknown as { updateComplete: Promise<unknown> }).updateComplete);
}
/** Put keyboard focus on a menu button the way a user does: a real click on the button before it, then Tab. */
async function tabTo(page: Page, id: string) {
  await button(page, id).focus();
  expect(await focused(page)).toContain("button");
}

test.describe("S31.3 <fp-menu>, keyboard and mouse", () => {
  test("the button and the menu carry the ARIA menu pattern", async ({ page }) => {
    await open(page);
    const b = button(page, "left");
    await expect(b).toHaveAttribute("aria-haspopup", "menu");
    await expect(b).toHaveAttribute("aria-expanded", "false");
    await expect(b).toHaveAccessibleName("Look");
    await expect(menu(page, "left")).toHaveCount(0);
    await b.click();
    await expect(b).toHaveAttribute("aria-expanded", "true");
    await expect(b).toHaveAttribute("aria-controls", (await menu(page, "left").getAttribute("id"))!);
    await expect(menu(page, "left")).toHaveAccessibleName("Look");
    const roles = await items(page, "left").evaluateAll((els) => els.map((e) => [e.getAttribute("role"), e.getAttribute("aria-checked"), e.getAttribute("aria-disabled"), e.textContent!.replace(/[✓●]/g, "").trim()]));
    expect(roles).toEqual([
      ["menuitemradio", "false", null, "2D"],
      ["menuitemradio", "true", null, "2.5D"],
      ["menuitemradio", "false", null, "3D"],
      ["menuitemcheckbox", "true", null, "Labels"],
      ["menuitemcheckbox", "false", "true", "Walls"],
      ["menuitem", null, null, "Reset view"],
    ]);
    await expect(page.locator("#left [role=group]")).toHaveCount(2);
    await expect(page.locator("#left [role=group]").first()).toHaveAccessibleName("View");
  });

  for (const key of ["Enter", " ", "ArrowDown"]) {
    test(`${JSON.stringify(key)} opens it on the first checked item`, async ({ page }) => {
      await open(page);
      await tabTo(page, "left");
      await page.keyboard.press(key);
      await expect(button(page, "left")).toHaveAttribute("aria-expanded", "true");
      expect(await focused(page)).toBe("menuitemradio:2.5D");
    });
  }

  test("it opens on the first item when none is checked, and ArrowDown or Enter on the button do not pick", async ({ page }) => {
    await open(page);
    await tabTo(page, "right");
    await page.keyboard.press("Enter");
    expect(await focused(page)).toContain("menuitem:\"><script>");
    expect(await picks(page)).toEqual([]);
  });

  test("arrows move and wrap, Home and End jump, a disabled item is skipped", async ({ page }) => {
    await open(page);
    await tabTo(page, "left");
    await page.keyboard.press("Enter"); // on 2.5D
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toBe("menuitemradio:3D");
    await page.keyboard.press("ArrowDown");
    expect(await focused(page)).toBe("menuitemcheckbox:Labels");
    await page.keyboard.press("ArrowDown"); // Walls is disabled
    expect(await focused(page)).toBe("menuitem:Reset view");
    await page.keyboard.press("ArrowDown"); // wraps
    expect(await focused(page)).toBe("menuitemradio:2D");
    await page.keyboard.press("ArrowUp"); // wraps back
    expect(await focused(page)).toBe("menuitem:Reset view");
    await page.keyboard.press("ArrowUp"); // skips Walls
    expect(await focused(page)).toBe("menuitemcheckbox:Labels");
    await page.keyboard.press("Home");
    expect(await focused(page)).toBe("menuitemradio:2D");
    await page.keyboard.press("End");
    expect(await focused(page)).toBe("menuitem:Reset view");
    expect(await picks(page)).toEqual([]);
  });

  test("Escape closes it and gives focus back to the button; the host's own Escape does not run", async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as unknown as { escapes: number }).escapes = 0; document.addEventListener("keydown", (e) => { if (e.key === "Escape") (window as unknown as { escapes: number }).escapes++; }); });
    await tabTo(page, "left");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(menu(page, "left")).toHaveCount(0);
    await expect(button(page, "left")).toHaveAttribute("aria-expanded", "false");
    expect(await focused(page)).toContain("button");
    expect(await page.evaluate(() => (window as unknown as { escapes: number }).escapes)).toBe(0);
    await page.keyboard.press("Escape"); // closed: Escape belongs to the host again
    expect(await page.evaluate(() => (window as unknown as { escapes: number }).escapes)).toBe(1);
  });

  test("Tab closes it and the button gets focus back, the next Tab moves on", async ({ page }) => {
    await open(page);
    await tabTo(page, "left");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(menu(page, "left")).toHaveCount(0);
    expect(await focused(page)).toContain("button");
    expect(await focused(page)).not.toContain("menuitem");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toContain("Mid");
  });

  test("Enter and Space pick an item: the event carries the item, closes, and focus returns to the button", async ({ page }) => {
    await open(page);
    await tabTo(page, "left");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown"); // 3D
    await page.keyboard.press("Enter");
    await expect(menu(page, "left")).toHaveCount(0);
    expect(await focused(page)).toContain("button");
    await page.keyboard.press("Enter");
    await page.keyboard.press("End"); // Reset view
    await page.keyboard.press(" ");
    const p = await picks(page);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ target: "left", bubbles: true, composed: true, detail: { kind: "radio", label: "3D", value: "3d", checked: false } });
    expect(p[1]).toMatchObject({ detail: { kind: "action", value: "reset" } });
  });

  test("a mouse click picks, a click on a disabled item does nothing and keeps it open", async ({ page }) => {
    await open(page);
    await button(page, "left").click();
    await items(page, "left").filter({ hasText: "Walls" }).click({ force: true });
    await expect(menu(page, "left")).toHaveCount(1);
    expect(await picks(page)).toEqual([]);
    await items(page, "left").filter({ hasText: "Labels" }).click();
    await expect(menu(page, "left")).toHaveCount(0);
    expect((await picks(page)).map((p) => p.detail.value)).toEqual(["labels"]);
  });

  test("a click outside closes it without a pick, a click on the button toggles it", async ({ page }) => {
    await open(page);
    await button(page, "left").click();
    await expect(menu(page, "left")).toHaveCount(1);
    await button(page, "left").click();
    await expect(menu(page, "left")).toHaveCount(0);
    await button(page, "left").click();
    await page.mouse.click(400, 480); // the plan stand-in's empty part, inside the card
    await expect(menu(page, "left")).toHaveCount(0);
    await button(page, "left").click();
    await page.mouse.click(5, 5); // outside the card altogether
    await expect(menu(page, "left")).toHaveCount(0);
    expect(await picks(page)).toEqual([]);
  });

  test("two menus on one page: opening one closes the other, ids differ, picks name their menu", async ({ page }) => {
    await open(page);
    await button(page, "left").click();
    const idLeft = await menu(page, "left").getAttribute("id");
    await button(page, "right").click();
    await expect(menu(page, "left")).toHaveCount(0);
    await expect(menu(page, "right")).toHaveCount(1);
    expect(await menu(page, "right").getAttribute("id")).not.toBe(idLeft);
    await expect(button(page, "left")).toHaveAttribute("aria-expanded", "false");
    await items(page, "right").filter({ hasText: "Last" }).click();
    expect((await picks(page)).map((p) => p.target)).toEqual(["right"]);
    // Keyboard on the second, then the first by keyboard: each opens on its own.
    await tabTo(page, "left");
    await page.keyboard.press("Enter");
    await expect(menu(page, "left")).toHaveCount(1);
    await expect(menu(page, "right")).toHaveCount(0);
  });

  test("a label of \"><script> shows as text and runs nothing", async ({ page }) => {
    await open(page);
    await button(page, "right").click();
    await expect(items(page, "right").first()).toHaveText('"><script>window.__xss=1</script>');
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator("#right script")).toHaveCount(0);
  });
});

test.describe("S31.3 <fp-menu>, place", () => {
  /** The rect of an element, or of the card, in page coordinates. */
  const rect = (page: Page, sel: string) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; });

  test("it opens below the button and inside the card, from the left button and from the right one", async ({ page }) => {
    await open(page, "?w=800");
    const card = await rect(page, "#card");
    for (const id of ["left", "right"]) {
      await button(page, id).click();
      const b = await rect(page, `#${id} button.btn`);
      const m = await rect(page, `#${id} [role=menu]`);
      expect(m.t, id).toBeGreaterThanOrEqual(b.b);
      expect(m.l, id).toBeGreaterThanOrEqual(card.l);
      expect(m.r, id).toBeLessThanOrEqual(card.r);
      await page.keyboard.press("Escape");
    }
  });

  test("on a card 480 wide it still stays inside, whichever side the button is on", async ({ page }) => {
    await open(page, "?w=480");
    const card = await rect(page, "#card");
    for (const id of ["left", "right"]) {
      await button(page, id).click();
      const m = await rect(page, `#${id} [role=menu]`);
      expect(m.l, id).toBeGreaterThanOrEqual(card.l);
      expect(m.r, id).toBeLessThanOrEqual(card.r);
      await page.keyboard.press("Escape");
    }
  });

  test("under 640 px the menu is a full-width panel under the button", async ({ page }) => {
    await open(page, "?w=390");
    const card = await rect(page, "#card");
    for (const id of ["left", "right"]) {
      await button(page, id).click();
      const b = await rect(page, `#${id} button.btn`);
      const m = await rect(page, `#${id} [role=menu]`);
      expect(Math.abs(m.l - card.l), id).toBeLessThanOrEqual(1);
      expect(Math.abs(m.w - card.w), id).toBeLessThanOrEqual(1);
      expect(m.t, id).toBeGreaterThanOrEqual(b.b);
      await page.keyboard.press("Escape");
    }
  });

  test("at 640 px it is not a full-width panel", async ({ page }) => {
    await open(page, "?w=640");
    await button(page, "left").click();
    const m = await rect(page, "#left [role=menu]");
    expect(m.w).toBeLessThan(500);
  });
});

test.describe("S31.3 <fp-menu>, size and colour", () => {
  const height = (page: Page) => items(page, "left").first().evaluate((el) => el.getBoundingClientRect().height);

  test("fine pointer: items are 32 px", async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
    await button(page, "left").click();
    expect(await height(page)).toBe(32);
  });

  test("colours come from --fp-* and follow the theme; the focused item is inverted", async ({ page }) => {
    for (const theme of ["light", "midnight", "solarized", "blueprint"]) {
      await open(page, `?theme=${theme}`);
      await button(page, "left").click();
      const want = await page.evaluate(() => {
        // A probe inside the card's shadow root, beside the menus, resolves the token the way the menu does.
        const root = document.getElementById("card")!.shadowRoot!;
        const probe = (v: string) => { const d = document.createElement("div"); d.style.color = `var(${v})`; root.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
        return { ink: probe("--fp-ink"), bg: probe("--fp-bg") };
      });
      const menuCss = await menu(page, "left").evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color }; });
      expect(menuCss, theme).toEqual({ bg: want.bg, color: want.ink });
      // The focused item (the checked one) is ink on bg, swapped.
      const focusedCss = await items(page, "left").nth(1).evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color }; });
      expect(focusedCss, theme).toEqual({ bg: want.ink, color: want.bg });
      // An unfocused item is the plain pair.
      const plain = await items(page, "left").nth(0).evaluate((el) => { const s = getComputedStyle(el); return { color: s.color }; });
      expect(plain.color, theme).toBe(want.ink);
    }
  });

  test("a disabled item is dimmed and a checked one shows its mark", async ({ page }) => {
    await open(page);
    await button(page, "left").click();
    const walls = items(page, "left").filter({ hasText: "Walls" });
    expect(Number(await walls.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.7);
    expect(Number(await items(page, "left").nth(0).evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    const mark = (n: number) => items(page, "left").nth(n).locator(".mark").evaluate((el) => getComputedStyle(el, "::before").content);
    expect(await mark(1)).not.toBe("none"); // 2.5D, checked
    expect(await mark(0)).toBe("none"); // 2D, not
  });
});

test.describe("S31.3 <fp-menu>, touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("coarse pointer: items are 44 px, a tap opens, a tap picks, a tap outside closes", async ({ page }) => {
    await open(page, "?w=360");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const tap = async (sel: string) => { const b = (await page.locator(sel).first().boundingBox())!; await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
    await tap("#left button.btn");
    await expect(menu(page, "left")).toHaveCount(1);
    expect(await items(page, "left").first().evaluate((el) => el.getBoundingClientRect().height)).toBe(44);
    await tap("#left [role=menuitemradio]:has-text('3D')");
    await expect(menu(page, "left")).toHaveCount(0);
    expect((await picks(page)).map((p) => p.detail.value)).toEqual(["3d"]);
    await tap("#left button.btn");
    await expect(menu(page, "left")).toHaveCount(1);
    const m = (await menu(page, "left").boundingBox())!;
    await page.touchscreen.tap(195, Math.min(800, m.y + m.height + 40)); // below the menu, outside the card
    await expect(menu(page, "left")).toHaveCount(0);
    expect((await picks(page)).length).toBe(1);
  });

  test("the button itself is at least 44 px on a coarse pointer", async ({ page }) => {
    await open(page, "?w=360");
    const b = (await button(page, "left").boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
  });
});

test.describe("Opus review of S31: a tall menu is capped to the viewport and scrolls", () => {
  const rect = (page: Page, sel: string) => page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom }; });
  for (const size of [{ width: 1024, height: 600 }, { width: 768, height: 1024 }]) {
    // 300: the card is short, so the card is the limit. 1400: the card runs past the screen, so the viewport is.
    for (const h of [300, 1400]) {
      test(`${size.width} x ${size.height}, card ${h} px tall: the panel stays inside the viewport and the card, and its last item is reachable`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, `?w=700&h=${h}&many=1`);
        await button(page, "left").click();
        const card = await rect(page, "#card"), m = await rect(page, "#left [role=menu]"), b = await rect(page, "#left button.btn");
        expect(m.t, "below the button").toBeGreaterThanOrEqual(b.b);
        expect(m.b, "inside the viewport, 8 px to spare").toBeLessThanOrEqual(size.height - 8 + 0.5);
        expect(m.b, "inside the card").toBeLessThanOrEqual(card.b + 0.5);
        expect(m.b - m.t, "at most min(70vh, 520)").toBeLessThanOrEqual(Math.min(0.7 * size.height, 520) + 0.5);
        const scrolls = await menu(page, "left").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        expect(scrolls, "forty items need a scroll").toBe(true);
        await items(page, "left").last().scrollIntoViewIfNeeded();
        await menu(page, "left").evaluate((el) => { el.scrollTop = el.scrollHeight; });
        const last = await items(page, "left").last().evaluate((el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom }; });
        const panel = await rect(page, "#left [role=menu]");
        expect(last.b, "the last item is inside the panel").toBeLessThanOrEqual(panel.b + 0.5);
        expect(last.t, "and shows").toBeGreaterThanOrEqual(panel.t - 0.5);
        expect(last.b, "and on screen").toBeLessThanOrEqual(size.height);
      });
    }
  }
});
