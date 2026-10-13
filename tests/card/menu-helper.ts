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
  await openMenu(page);
  await menuItem(page, value).click();
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
  await openMenu(page);
  const checks = await Promise.all(values.map(async (v) => [v, await menuItem(page, `${group}:${v}`).getAttribute("aria-checked")] as const));
  await closeMenu(page);
  return checks.find(([, c]) => c === "true")?.[0] ?? null;
}
