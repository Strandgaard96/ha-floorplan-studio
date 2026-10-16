import { test, expect } from "@playwright/test";

// A menu closes when the pointer goes down anywhere outside it, not only on a completed click. A drag on the plan
// (a device moved, a marquee) never ends in a click on the plan, so the menu used to stay open over the toolbar and
// the plan, and on a narrow or wide-font toolbar it covered Undo. Real page.mouse at real coordinates (finding 3).

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/standalone.html");
  await page.locator("#fixPlan").uncheck();
  await expect(page.locator("svg polygon[data-r]").first()).toBeVisible();
});

for (const menu of ["View", "File", "Edit", "Add"]) {
  test(`a drag that starts on the plan closes the ${menu} menu`, async ({ page }) => {
    await page.locator(`details.menu > summary:text-is("${menu}")`).click();
    await expect(page.locator(`details.menu[open] > summary:text-is("${menu}")`)).toHaveCount(1);
    const b = (await page.locator("svg g[data-x]").first().boundingBox())!;
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(
      page.locator("details.menu[open]"),
      "pointer down closes the menu at once, before any click",
    ).toHaveCount(0);
    await page.mouse.move(x + 30, y + 20, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator("#undo")).toBeEnabled();
    await page.locator("#undo").click(); // nothing covers Undo
    await expect(page.locator("#undo")).toBeDisabled();
  });
}

test("a press inside an open menu leaves it open, and the item still works", async ({ page }) => {
  await page.locator(`details.menu > summary:text-is("View")`).click();
  const b = (await page.locator("#mOpt .box").boundingBox())!;
  await page.mouse.move(b.x + 4, b.y + 4);
  await page.mouse.down();
  await expect(page.locator("#mOpt")).toHaveAttribute("open", "");
  await page.mouse.up();
  await expect(page.locator("#mOpt")).toHaveAttribute("open", "");
});
