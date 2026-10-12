import { test, expect, type Page } from "@playwright/test";
import { demo } from "./helpers-3d";
import { FLOORPLAN_CSS, renderFloor } from "../../src/core/render";

// S29 (H3-H5, AC 13, AC 14): the 2D pill and the temp icon's ring, read back from Chromium (finding 10). Expected colours are
// computed here from the theme's own tokens, in sRGB, the way color-mix(in srgb) mixes. Rooms: Living 16 °C (and 48 %), Kitchen
// 21, Hall 26, Garden 18.5 (t .25: a real mix, finding 4), Garden pond humidity only. Bounds 16 and 26.
const st = (state: string, unit: string) => ({
  state,
  attributes: { unit_of_measurement: unit },
  last_changed: "2026-10-12T10:00:00Z",
});
const floor = () => {
  const f = structuredClone(demo.floors.ground);
  Object.assign(f.rooms[0], { temps: ["sensor.t_living"], humidity: ["sensor.h_living"] });
  Object.assign(f.rooms[1], { temps: ["sensor.t_kitchen"] });
  Object.assign(f.rooms[2], { temps: ["sensor.t_hall"] });
  Object.assign(f.rooms[4], { temps: ["sensor.t_garden"] });
  Object.assign(f.rooms[6], { humidity: ["sensor.h_pond"] });
  return f;
};
const states = (icon = "16") => ({
  "sensor.t_living": st("16", "°C"),
  "sensor.h_living": st("48", "%"),
  "sensor.t_kitchen": st("21", "°C"),
  "sensor.t_hall": st("26", "°C"),
  "sensor.t_garden": st("18.5", "°C"),
  "sensor.h_pond": st("80", "%"),
  "sensor.demo_living_temperature": st(icon, "°C"), // device 4, the temp icon
});
const T: Record<string, number> = { "0": 0, "1": 0.5, "2": 1, "4": 0.25 };
const NOW = Date.parse("2026-10-12T10:00:05Z");
const markup = (s = states(), extra: object = {}) =>
  renderFloor(floor() as never, { scale: 1, state: s as never, now: NOW, tempColors: [16, 26], ...extra });
const plan = (theme: string, body: string) => {
  const [t, mode] = theme === "ha-dark" ? ["ha", "dark"] : [theme, "light"];
  return `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg width="1000" height="800" viewBox="0 0 1000 800"><g data-theme="${t}" data-mode="${mode}" id="p">${body}</g></svg></body></html>`;
};
const read = (page: Page) =>
  page.evaluate(() => {
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "#000";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const p = document.getElementById("p")!,
      tok = (n: string) => rgb(getComputedStyle(p).getPropertyValue(n).trim());
    const pills = Object.fromEntries(
      [...document.querySelectorAll<SVGRectElement>("rect.val-pill")].map((r) => {
        const s = getComputedStyle(r);
        return [r.dataset.rp!, { fill: rgb(s.fill), opacity: s.fillOpacity, events: s.pointerEvents }];
      }),
    );
    const halo = document.querySelector('g[data-x="4"] .halo')!,
      h = getComputedStyle(halo);
    return {
      cold: tok("--fp-temp-cold"),
      mid: tok("--fp-temp-mid"),
      hot: tok("--fp-temp-hot"),
      pills,
      ring: { cls: halo.getAttribute("class"), stroke: rgb(h.stroke), width: h.strokeWidth },
      texts: Object.fromEntries(
        [...document.querySelectorAll<SVGTextElement>("text.val[data-rv]")].map((t) => [t.dataset.rv!, t.textContent]),
      ),
    };
  });
const mix = (a: number[], b: number[], share: number) => a.map((v, k) => v * share + b[k]! * (1 - share));
const want = (t: number, c: number[], m: number[], h: number[]) =>
  t <= 0.5 ? mix(c, m, 1 - 2 * t) : mix(m, h, 2 - 2 * t);
const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) <= 2);

for (const theme of ["light", "ha-dark", "blueprint"]) {
  test(`${theme}: each room's pill is its temperature's colour from the theme's tokens, at 35 %, never a click target (AC 13)`, async ({
    page,
  }) => {
    await page.setContent(plan(theme, markup()));
    const r = await read(page);
    expect(Object.keys(r.pills).sort()).toEqual(["0", "1", "2", "4"]);
    for (const [i, t] of Object.entries(T)) {
      const w = want(t, r.cold, r.mid, r.hot);
      expect(near(r.pills[i]!.fill, w), `room ${i}, t ${t}: ${r.pills[i]!.fill} vs ${w}`).toBe(true);
      expect(r.pills[i]!.opacity).toBe("0.35");
      expect(r.pills[i]!.events).toBe("none");
    }
  });
  test(`${theme}: a temp icon at 16 and 26 °C wears a ring in the cold and the hot colour (AC 14)`, async ({
    page,
  }) => {
    for (const [v, key] of [
      ["16", "cold"],
      ["26", "hot"],
    ] as const) {
      await page.setContent(plan(theme, markup(states(v))));
      const r = await read(page);
      expect(r.ring.cls).toBe("halo heat");
      expect(near(r.ring.stroke, r[key]), `${v} °C: ${r.ring.stroke} vs ${r[key]}`).toBe(true);
      expect(r.ring.width).toBe("2px");
    }
  });
}

test("the readout text is character for character the same with the pill (AC 13)", async ({ page }) => {
  await page.setContent(plan("light", renderFloor(floor() as never, { scale: 1, state: states() as never, now: NOW })));
  const before = (await read(page)).texts;
  await page.setContent(plan("light", markup()));
  const after = await read(page);
  expect(after.texts).toEqual(before);
  expect(after.texts["0"]).toBe("16 °C · 48 %");
  expect(await page.locator('text.val[data-rv="0"] tspan.val-t').textContent()).toBe("16 °C");
  expect(await page.locator('text.val[data-rv="6"] tspan').count()).toBe(0);
  // On the pill the temperature has no outline (it would cover the pill's top half); the rest of the line keeps its own.
  expect(await page.locator('text.val[data-rv="0"] tspan.val-t').evaluate((t) => getComputedStyle(t).stroke)).toBe(
    "none",
  );
  expect(await page.locator('text.val[data-rv="0"]').evaluate((t) => getComputedStyle(t).stroke)).not.toBe("none");
});

// Pill polish (Diego, 2026-10-12): "give the pill a small border" and "Badeværelse oppe is not aligned in the pill". The line
// was centred on an estimated width, so the estimate's whole error landed on the pill's left (6.8 against 0.3 units in Roboto).
// The line now starts at a computed left edge and the pill starts 3 units before it: exact in any font. Only the right edge
// leans on the estimate of the short temperature.
test("the pill starts exactly 3 units before its temperature and ends close after it; it has a 1 px border", async ({
  page,
}) => {
  await page.setContent(plan("light", markup()));
  const r = await page.evaluate(() =>
    [...document.querySelectorAll<SVGRectElement>("rect.val-pill")].map((p) => {
      const t = document.querySelector<SVGTSpanElement>(`text.val[data-rv="${p.dataset.rp}"] tspan.val-t`)!;
      const pb = p.getBBox(),
        tb = t.getBBox(),
        s = getComputedStyle(p);
      return {
        left: tb.x - pb.x,
        right: pb.x + pb.width - (tb.x + tb.width),
        stroke: s.stroke,
        width: s.strokeWidth,
        fill: s.fill,
      };
    }),
  );
  expect(r.length).toBe(4);
  for (const p of r) {
    expect(Math.abs(p.left - 3), JSON.stringify(p)).toBeLessThan(0.5);
    expect(Math.abs(p.right), JSON.stringify(p)).toBeLessThan(0.35 * 12 + 1); // the estimate's slack on a short string
    expect(p.stroke).toBe(p.fill); // the border is the pill's own colour, at full strength over its 35 % fill
    expect(p.width).toBe("1px");
  }
});
