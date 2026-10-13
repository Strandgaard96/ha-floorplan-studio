import type { Page } from "@playwright/test";

/** S31.5: the look controls (View, Walls, Theme, Labels, ...) sit in the View options box, closed until the header's
 *  "View options" button opens it. A real click, so a test that needs a control opens it the way a person does.
 *  Idempotent: open stays open, and a reload or a new config closes it again, so call it before each use. */
export async function openOptions(page: Page): Promise<void> {
  const button = page.locator("floorplan-studio-card").locator("css=button[aria-label='View options']");
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

/** The same button again closes the box, so a click on the plan under it lands on the plan. */
export async function closeOptions(page: Page): Promise<void> {
  const button = page.locator("floorplan-studio-card").locator("css=button[aria-label='View options']");
  if ((await button.getAttribute("aria-expanded")) === "true") await button.click();
}
