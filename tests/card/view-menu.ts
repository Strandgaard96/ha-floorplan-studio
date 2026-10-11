import type { FloorplanStudioCard } from "../../src/card/floorplan-studio-card";

/** UI refactor 3: the look controls (Theme, Tilt, Walls, Labels, Device names, Floor below, Floors below) sit in the View
 * options menu at every width, closed by default. A unit test that drives one opens it first, as a viewer does. */
export async function openViewMenu(el: FloorplanStudioCard): Promise<void> {
  const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="View options"]');
  if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
    toggle.click();
    await el.updateComplete;
  }
}
