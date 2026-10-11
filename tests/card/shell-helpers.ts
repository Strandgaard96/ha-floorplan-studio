import type { Page } from "@playwright/test";

// UI refactor, lane ui-shell: the look controls (Theme, Tilt, Walls, Labels, Device names, Floor below, Floors below) are in
// the View options menu at every width, closed by default, and the Overview starts folded. A spec that drives one of them
// opens it first with a real click, as a viewer does.

/** Opens the View options menu (a real click on its button) unless it is open. */
export async function openViewMenu(page: Page): Promise<void> {
  const t = page.locator("floorplan-studio-card").locator('button[aria-label="View options"]');
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
}

/** Unfolds the Overview (a real click on its arrow) unless it is open. */
export async function openOverview(page: Page): Promise<void> {
  const b = page.locator("floorplan-studio-card").locator("button.fp-active-collapse");
  if ((await b.count()) && (await b.getAttribute("aria-expanded")) === "false") await b.click();
}

const LABEL: Record<string, string> = { "2d": "2D", "2.5d": "2.5D", "3d": "3D" };
/** The View segmented control seen as the old select was: `selectOption("3d")` is a real click on the 3D segment, `inputValue()`
 * the value of the pressed one. (UI refactor 3: View is a group of aria-pressed buttons, not a select.) */
export const viewControl = (page: Page) => {
  const group = page.locator("floorplan-studio-card").locator('[role="group"][aria-label="View"]');
  return {
    group,
    selectOption: (v: string) => group.getByRole("button", { name: LABEL[v]!, exact: true }).click(),
    inputValue: async () => {
      const on = await group.locator('button[aria-pressed="true"]').textContent();
      return Object.entries(LABEL).find(([, l]) => l === on?.trim())?.[0] ?? "";
    },
  };
};
