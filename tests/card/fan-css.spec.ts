import { test, expect } from "@playwright/test";
import { FLOORPLAN_CSS, THEMES } from "../../src/core/render";
import { DEVICE_ICONS } from "../../src/core/icons";

// S33.1, findings 10 and 16: the rule `.dev-fan.on{--fp-dev:var(--fp-dev-fan)}` read as a string says nothing about specificity.
// Read the fan's on disc back from Chromium in every theme: a real colour, not the idle grey, and the theme's own --fp-dev-fan.
const icon = (state: string) =>
  `<g class="dev dev-fan ${state}"><circle class="halo" r="12"/><path d="${DEVICE_ICONS.fan}"/></g>`;
const plan = (body: string) =>
  `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg>${THEMES.map((t) => `<g data-theme="${t}" data-mode="dark" id="t-${t}">${body}</g>`).join("")}<g data-theme="ha" id="t-ha-light">${body}</g></svg></body></html>`;

test("fan: the on disc wears --fp-dev-fan, not the idle grey, in every theme", async ({ page }) => {
  await page.setContent(
    plan(
      `${icon("off")}${icon("on")}<g class="probe" style="fill:var(--fp-dev-fan)"><path d="M0 0"/></g><g class="probe" style="fill:var(--fp-idle)"><path d="M0 0"/></g>`,
    ),
  );
  // Every theme in dark mode, and `ha` in light as well (no data-mode: HA_LIGHT is a separate rule from HA_DARK).
  for (const t of [...THEMES, "ha-light"]) {
    const r = await page.locator(`#t-${t}`).evaluate((g) => {
      const fill = (i: number, sel: string) => getComputedStyle(g.children[i].querySelector(sel)!).fill;
      return { off: fill(0, ".halo"), on: fill(1, ".halo"), fan: fill(2, "path"), idle: fill(3, "path") };
    });
    for (const v of Object.values(r)) expect(v, t).toMatch(/^(rgb|color)\(/);
    expect(r.on, `${t}: fan on is its own colour`).toBe(r.fan);
    expect(r.on, `${t}: fan on is not idle`).not.toBe(r.idle);
    expect(r.on, `${t}: fan on differs from fan off`).not.toBe(r.off);
  }
});
