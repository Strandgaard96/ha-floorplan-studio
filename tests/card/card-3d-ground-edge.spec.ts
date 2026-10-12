import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, drawn, cam, canvas } from "./helpers-3d";

// UI refactor item 11a: the 3D ground has no visible edge. The canvas is transparent over the card, so a hard-edged ground reads as a
// stripe (a dark one on a light page in a dark theme). The ground fades to nothing toward its border: at the border the pixel is what
// lies behind the canvas, and the ground a little inside it (just outside the house) is still solid. Real screenshots; the test hook's
// `shade().ground` gives the ground's box (plan terms [x0, y0, z0, x1, y1, z1]), `project` the camera's own projection.
const hook = <T>(page: Page, expr: string) => page.evaluate(`(${expr})(window.__fp3d)`) as Promise<T>;

async function boot(page: Page, theme: string, night: boolean) {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, isNight]) => {
      const el = document.getElementById("card") as any;
      el.setConfig(config);
      el.hass = {
        states: isNight
          ? { "sun.sun": { state: "below_horizon", attributes: {}, last_changed: new Date().toISOString() } }
          : {},
        callService: () => undefined,
      };
      return el.updateComplete;
    },
    [{ layout: structuredClone(demo), floor: "ground", view: "3d", theme, active_list: false }, night] as const,
  );
  await drawn(page);
}
async function still(page: Page) {
  let prev = -1,
    same = 0;
  await expect
    .poll(
      async () => {
        const n = (await cam(page)).drawn;
        same = n === prev ? same + 1 : 0;
        prev = n;
        return same;
      },
      { intervals: [100], timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(3);
}
async function rgbAt(page: Page, p: { x: number; y: number }) {
  const buf = await page.screenshot({ clip: { x: Math.round(p.x), y: Math.round(p.y), width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, buf.toString("base64"));
}
const far = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

for (const [theme, night] of [
  ["light", false],
  ["blueprint", false],
  ["blueprint", true],
  ["ha", false],
] as const)
  test(`${theme}${night ? " at night" : ""}: the ground's border is the colour behind the canvas, and the ground inside it is solid`, async ({
    page,
  }) => {
    await boot(page, theme, night);
    await hook(page, `(h) => h.look(0, 0.5)`);
    const c = (await canvas(page).boundingBox())!;
    // Zoom out until the whole ground is in the view, with 6 px to spare.
    const g = await hook<{ ground: { box: number[] } }>(page, `(h) => h.shade()`).then((s) => s.ground.box);
    const at = (x: number, y: number) => hook<{ x: number; y: number }>(page, `(h) => h.project(${x}, ${y}, ${g[2]})`);
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    for (let i = 0; i < 12; i++) {
      const corners = [await at(g[0], g[1]), await at(g[3], g[1]), await at(g[0], g[4]), await at(g[3], g[4])];
      if (corners.every((p) => p.x > c.x + 6 && p.x < c.x + c.width - 6 && p.y > c.y + 6 && p.y < c.y + c.height - 6))
        break;
      await page.mouse.wheel(0, 300);
      await still(page);
    }
    await still(page);
    const cx = (g[0] + g[3]) / 2,
      cy = (g[1] + g[4]) / 2;
    const behind = await rgbAt(page, { x: c.x + 3, y: c.y + c.height - 3 }); // a corner of the canvas: nothing but the card behind it
    // The west, east and south border midpoints (the north one lies behind the house's tall walls from here), 1.5 cm inside the box: invisible. Just outside the house (a third of the way to the border): solid.
    for (const [name, x, y] of [
      ["west", g[0] + 1.5, cy],
      ["east", g[3] - 1.5, cy],
      ["south", cx, g[4] - 1.5],
    ] as const) {
      const px = await rgbAt(page, await at(x, y));
      expect(far(px, behind), `${name} border pixel ${px} against what is behind ${behind}`).toBeLessThanOrEqual(10);
    }
    const inner = await rgbAt(page, await at(g[0] + (cx - g[0]) * 0.22, cy)); // 0.22 of the way in from the west border: 0.78 of the half extent
    expect(far(inner, behind), `a ground pixel ${inner} must differ from what is behind ${behind}`).toBeGreaterThan(10);
  });
