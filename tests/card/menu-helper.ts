import type { Page } from "@playwright/test";

// S31.6: the look controls are the header's ⋯ menu (docs/specs/card-layout-touch.md, D3). Tests that used to reach a select, a
// slider or a toggle in the old toolbar now go through the real menu, by real mouse clicks (`locator.click` moves the mouse to the
// element's centre and fails if something else is on top, finding 3). An item is named by its `data-value` (the id the card
// wrote into it: `view:2.5d`, `theme:midnight`, `labels`, `rotate:1`, `reset` ...), so a test does not depend on a label's wording;
// the accessible names of the spec are what `card-menu.spec.ts` asserts.

const card = (page: Page) => page.locator("floorplan-studio-card");
export const menuButton = (page: Page) => card(page).locator("css=button[aria-label='View options']");
export const menuPanel = (page: Page) => card(page).locator("css=[role=menu][aria-label='View options']");
export const menuItem = (page: Page, value: string) => menuPanel(page).locator(`css=[data-value="${value}"]`);

/** Opens the menu with a click on its button (it stays open if it is). */
export async function openMenu(page: Page): Promise<void> {
  if ((await menuButton(page).getAttribute("aria-expanded")) !== "true") await menuButton(page).click();
  await menuPanel(page).waitFor();
}

/** Closes it with Escape, which gives focus back to the button (a click on the button would do too). */
export async function closeMenu(page: Page): Promise<void> {
  if ((await menuButton(page).getAttribute("aria-expanded")) === "true") await page.keyboard.press("Escape");
}

/** Opens the menu and clicks the item. The menu closes on a pick. Fails with the missing value if there is no such item. */
export async function pick(page: Page, value: string): Promise<void> {
  if (value.startsWith("theme:")) return chooseTheme(page, value.slice(6));
  await openMenu(page);
  await menuItem(page, value).click();
}

/** Opens the menu and clicks the item with Alt held (Layers: show this one alone). */
export async function pickAlt(page: Page, value: string): Promise<void> {
  await openMenu(page);
  await page.keyboard.down("Alt");
  try { await menuItem(page, value).click(); } finally { await page.keyboard.up("Alt"); }
}

/** `aria-checked` of an item ("true", "false"), or `null` for an item that has no state (an action); throws if absent. Closes after reading. */
export async function stateOf(page: Page, value: string): Promise<string | null> {
  await openMenu(page);
  const v = await menuItem(page, value).getAttribute("aria-checked");
  await closeMenu(page);
  return v;
}

/** Whether the menu has an item with this value. Opens and closes it; a card with no menu has none. */
export async function hasItem(page: Page, value: string): Promise<boolean> {
  if ((await menuButton(page).count()) === 0) return false;
  await openMenu(page);
  const n = await menuItem(page, value).count();
  await closeMenu(page);
  return n > 0;
}

/** Whether an item is disabled (`aria-disabled`). */
export async function isDisabled(page: Page, value: string): Promise<boolean> {
  await openMenu(page);
  const v = await menuItem(page, value).getAttribute("aria-disabled");
  await closeMenu(page);
  return v === "true";
}

export const setView = (page: Page, v: "2d" | "2.5d" | "3d") => pick(page, `view:${v}`);
export const setTheme = (page: Page, t: string) => pick(page, `theme:${t}`);
export const setWalls = (page: Page, w: "full" | "cut" | "low") => pick(page, `walls:${w}`);
export const setBelow = (page: Page, b: "off" | "ghost" | "solid") => pick(page, `below:${b}`);
export const rotateLeft = (page: Page) => pick(page, "rotate:-1");
export const rotateRight = (page: Page) => pick(page, "rotate:1");
export const resetView = (page: Page) => pick(page, "reset");

/** The checked item of a radio group: the first `<group>:<value>` whose `aria-checked` is "true", as the value, or null. Closes after reading. */
export async function checkedIn(page: Page, group: string, values: readonly string[]): Promise<string | null> {
  if (group === "theme") return themeNow(page, values);
  await openMenu(page);
  const checks = await Promise.all(values.map(async (v) => [v, await menuItem(page, `${group}:${v}`).getAttribute("aria-checked")] as const));
  await closeMenu(page);
  return checks.find(([, c]) => c === "true")?.[0] ?? null;
}

// The Theme item is a select (docs/DECISIONS.md, 2026-10-14): `pick(page, "theme:x")` and `checkedIn(page, "theme", ...)` go through it.
export const themeSelect = (page: Page) => menuPanel(page).locator("css=select[data-value=theme]");

/** Opens the menu, clicks the Theme select with the real mouse (it must be the element hit, and take focus), then picks the option.
 *  The native list is drawn by the browser outside the page, so no `page.mouse` click can land on one of its rows; `selectOption`
 *  sets the value and fires `input` and `change` on the real element, which is what choosing a row does. The keys have their own test. */
export async function chooseTheme(page: Page, t: string): Promise<void> {
  await openMenu(page);
  const sel = themeSelect(page);
  await sel.click();
  const onSelect = await sel.evaluate((s) => (s.getRootNode() as ShadowRoot).activeElement === s);
  if (!onSelect) throw new Error("the click did not land on the Theme select");
  await sel.selectOption(`theme:${t}`);
}

/** The Theme select's current value without the prefix, or null. Closes after reading. */
export async function themeNow(page: Page, themes: readonly string[]): Promise<string | null> {
  await openMenu(page);
  const v = await themeSelect(page).evaluate((s) => (s as HTMLSelectElement).value);
  await closeMenu(page);
  return themes.find((t) => `theme:${t}` === v) ?? null;
}
