import type { FloorplanStudioCard } from "../../src/card/floorplan-studio-card";
import type { FpMenu } from "../../src/card/more-menu";

// S31.6 (jsdom): the look controls are the header's ⋯ menu. These helpers go through the real menu, as a viewer does: click the
// button, click the item in the open panel. An item is named by its `data-value` (`view:2.5d`, `theme:midnight`, `labels`,
// `rotate:1`, `reset` ...). Nothing here calls a card method or fires `fp-menu-pick` by hand.

export const menuOf = (el: FloorplanStudioCard): FpMenu | null => el.shadowRoot!.querySelector<FpMenu>("fp-menu");
const settle = async (el: FloorplanStudioCard) => {
  await menuOf(el)?.updateComplete;
  await el.updateComplete;
};
const button = (el: FloorplanStudioCard) => menuOf(el)!.shadowRoot!.querySelector<HTMLButtonElement>("button.btn")!;
const panel = (el: FloorplanStudioCard) => menuOf(el)!.shadowRoot!.querySelector<HTMLElement>('[role="menu"]');

export async function openMenu(el: FloorplanStudioCard): Promise<void> {
  if (!panel(el)) { button(el).click(); await settle(el); }
}
export async function closeMenu(el: FloorplanStudioCard): Promise<void> {
  if (panel(el)) { button(el).click(); await settle(el); }
}
/** The item in the open panel, or null. Opens the menu first. */
export async function itemOf(el: FloorplanStudioCard, value: string): Promise<HTMLElement | null> {
  await openMenu(el);
  return panel(el)!.querySelector<HTMLElement>(`[data-value="${value}"]`);
}
/** Opens the menu and clicks the item (Alt held when `alt`). The menu closes on a pick. Throws when there is no such item. */
export async function pickItem(el: FloorplanStudioCard, value: string, alt = false): Promise<void> {
  if (value.startsWith("theme:")) return chooseThemeItem(el, value);
  const it = await itemOf(el, value);
  if (!it) throw new Error(`no menu item "${value}"`);
  it.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, altKey: alt }));
  await settle(el);
}
/** The Theme item is a select (DECISIONS 2026-10-14): choosing is a value and a `change` on it, as a row of its list does. Throws when the select has no such option. */
async function chooseThemeItem(el: FloorplanStudioCard, value: string): Promise<void> {
  await openMenu(el);
  const sel = panel(el)!.querySelector<HTMLSelectElement>('select[data-value="theme"]');
  if (!sel || ![...sel.options].some((o) => o.value === value)) throw new Error(`no menu item "${value}"`);
  sel.value = value;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  await settle(el);
}
/** The Theme select's value ("theme:midnight"), or null without one. Opens, reads, closes. */
export async function themeSelectValue(el: FloorplanStudioCard): Promise<string | null> {
  await openMenu(el);
  const v = panel(el)!.querySelector<HTMLSelectElement>('select[data-value="theme"]')?.value ?? null;
  await closeMenu(el);
  return v;
}
/** `aria-checked` of an item, or null for an action. Opens, reads, closes. */
export async function stateOfItem(el: FloorplanStudioCard, value: string): Promise<string | null> {
  const v = (await itemOf(el, value))?.getAttribute("aria-checked") ?? null;
  await closeMenu(el);
  return v;
}
export async function hasMenuItem(el: FloorplanStudioCard, value: string): Promise<boolean> {
  if (!menuOf(el)) return false;
  const has = (await itemOf(el, value)) !== null;
  await closeMenu(el);
  return has;
}
export async function menuItemDisabled(el: FloorplanStudioCard, value: string): Promise<boolean> {
  const it = await itemOf(el, value);
  const d = it?.getAttribute("aria-disabled") === "true";
  await closeMenu(el);
  return d;
}
