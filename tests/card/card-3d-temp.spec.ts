import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, holder, drawn, cam } from "./helpers-3d";

// S29 (H6, AC 15, Review focus 3): the 3D readout's pill and the temp icon's ring, read from Chromium on the overlay itself.
// Same rooms as temp-pill-2d.spec.ts: Living 16 °C (and 48 %), Kitchen 21, Hall 26, Garden 18.5; bounds 16 and 26.
const HA_DARK =
  "--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--card-background-color:#1c1c1c;--secondary-background-color:#282828";
const st = (state: string, unit: string) => ({
  state,
  attributes: { unit_of_measurement: unit },
  last_changed: new Date().toISOString(),
});
const layout = () => {
  const l = structuredClone(demo);
  const r = l.floors.ground.rooms;
  Object.assign(r[0], { temps: ["sensor.t_living"], humidity: ["sensor.h_living"] });
  Object.assign(r[1], { temps: ["sensor.t_kitchen"] });
  Object.assign(r[2], { temps: ["sensor.t_hall"] });
  Object.assign(r[4], { temps: ["sensor.t_garden"] });
  return l;
};
const states = (living = "16", icon = "16") => ({
  "sensor.t_living": st(living, "°C"),
  "sensor.h_living": st("48", "%"),
  "sensor.t_kitchen": st("21", "°C"),
  "sensor.t_hall": st("26", "°C"),
  "sensor.t_garden": st("18.5", "°C"),
  "sensor.demo_living_temperature": st(icon, "°C"),
});
const T: Record<string, number> = { "0": 0, "1": 0.5, "2": 1, "4": 0.25 };

async function boot(page: Page, theme: string, vars = "", dark = false) {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, v, isDark, s]) => {
      document.body.setAttribute("style", v as string);
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = { states: s, themes: { darkMode: isDark }, callService: () => undefined };
      return el.updateComplete;
    },
    [
      { layout: layout(), floor: "ground", view: "3d", theme, active_list: false, heat_min: 16, heat_max: 26 },
      vars,
      dark,
      states(),
    ] as const,
  );
  await drawn(page);
}
async function setStates(page: Page, s: Record<string, unknown>) {
  const n = (await cam(page)).drawn;
  await page.evaluate((s) => {
    const el = document.getElementById("card") as unknown as { hass: Record<string, unknown> };
    el.hass = { ...el.hass, states: s };
  }, s);
  await expect.poll(async () => (await cam(page)).drawn, { timeout: 5000 }).toBeGreaterThan(n);
}
/** sRGB channels 0..1 and alpha of a computed colour (`rgb()`, `rgba()` or `color(srgb … / a)`). */
const parse = (c: string) => {
  const m = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/.exec(c);
  if (m) return { rgb: [m[1], m[2], m[3]].map(Number), a: m[4] === undefined ? 1 : Number(m[4]) };
  const n = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(c)!;
  return { rgb: [n[1], n[2], n[3]].map((v) => Number(v) / 255), a: n[4] === undefined ? 1 : Number(n[4]) };
};
const read = (page: Page) =>
  holder(page).evaluate((root) => {
    const probe = document.createElement("span");
    root.appendChild(probe);
    const tok = (n: string) => {
      probe.style.color = `var(${n})`;
      return getComputedStyle(probe).color;
    };
    const out = {
      cold: tok("--fp-temp-cold"),
      mid: tok("--fp-temp-mid"),
      hot: tok("--fp-temp-hot"),
      pills: Object.fromEntries(
        [...root.querySelectorAll<HTMLElement>(".fp3-rm")].flatMap((el) => {
          const p = el.querySelector<HTMLElement>(".fp3-val .val-pill");
          return p ? [[el.dataset.r!, getComputedStyle(p).backgroundColor]] : [];
        }),
      ),
      ring: (() => {
        const h = root.querySelector('svg.fp3-ic[data-i="4"] .halo');
        return h
          ? { cls: h.getAttribute("class"), stroke: getComputedStyle(h).stroke, width: getComputedStyle(h).strokeWidth }
          : null;
      })(),
    };
    probe.remove();
    return out;
  });
const mix = (a: number[], b: number[], s: number) => a.map((v, k) => v * s + b[k]! * (1 - s));
const want = (t: number, c: number[], m: number[], h: number[]) =>
  t <= 0.5 ? mix(c, m, 1 - 2 * t) : mix(m, h, 2 - 2 * t);
const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) <= 2 / 255);

for (const [name, theme, vars, dark] of [
  ["light", "light", "", false],
  ["ha-dark", "ha", HA_DARK, true],
  ["blueprint", "blueprint", "", false],
] as const) {
  test(`${name}: the overlay's pills are the 2D colours at 35 % (AC 15)`, async ({ page }) => {
    await boot(page, theme, vars, dark);
    await expect.poll(async () => Object.keys((await read(page)).pills).sort()).toEqual(["0", "1", "2", "4"]);
    const r = await read(page),
      [c, m, h] = [r.cold, r.mid, r.hot].map((x) => parse(x).rgb);
    for (const [i, t] of Object.entries(T)) {
      const got = parse(r.pills[i]!);
      expect(near(got.rgb, want(t, c!, m!, h!)), `room ${i}: ${r.pills[i]}`).toBe(true);
      expect(got.a).toBeCloseTo(0.35, 2);
    }
  });
  test(`${name}: the temp icon's ring in 3D is the cold colour at 16 °C (Review focus 3)`, async ({ page }) => {
    await boot(page, theme, vars, dark);
    await expect.poll(async () => (await read(page)).ring?.cls).toBe("halo heat");
    const r = await read(page);
    expect(near(parse(r.ring!.stroke).rgb, parse(r.cold).rgb), `${r.ring!.stroke} vs ${r.cold}`).toBe(true);
    expect(r.ring!.width).toBe("2px");
  });
}

test("a state change from 16 to 26 °C recolours the Living pill to the hot colour (AC 15)", async ({ page }) => {
  await boot(page, "light");
  await expect.poll(async () => (await read(page)).pills["0"]).toBeTruthy();
  await setStates(page, states("26", "26"));
  await expect
    .poll(async () => {
      const r = await read(page);
      return near(parse(r.pills["0"]!).rgb, parse(r.hot).rgb);
    })
    .toBe(true);
});
