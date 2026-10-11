import { test, expect } from "@playwright/test";
import { DEVICE_TYPES } from "../../src/core/schema";
import { DEVICE_COLOURS, FLOORPLAN_CSS, THEMES, renderFloor } from "../../src/core/render";

// UI refactor, item 6: one red. Red is for alerts only (an open door or window, a contact, a lock or vibration sensor, an armed
// or sounding alarm, a siren). Motion has a role of its own in every theme: not red, not the lights' colour, and a room that
// lights up for motion carries that in its one outline, so the sensor adds no second ring. Read back from Chromium (finding 10);
// the per-type rule iterates the whole DeviceType union (finding 17).

const ALERT_TYPES = new Set(["contact", "lock", "vibration", "siren", "alarm"]);
const st = (state: string) => ({ state, attributes: {}, last_changed: "2026-09-18T10:00:00Z" });
const NOW = Date.parse("2026-09-18T10:00:05Z");
const room = {
  name: "Hall",
  kind: "room",
  pts: [
    [0, 0],
    [400, 0],
    [400, 300],
    [0, 300],
  ],
};
const floor = (devices: unknown[]) => ({
  outline: [],
  rooms: [room],
  walls: [],
  openings: [],
  doors: [],
  stairs: [],
  extras: [],
  furniture: [],
  unlinked: [],
  devices,
});

/** Hue 0..360, saturation and lightness 0..1 of a #rrggbb. */
const hsl = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
};
const isRed = (hex: string) => {
  const { h, s, l } = hsl(hex);
  return s > 0.4 && l > 0.2 && l < 0.75 && (h < 22 || h > 342);
};
const hueGap = (a: string, b: string) => {
  const d = Math.abs(hsl(a).h - hsl(b).h);
  return Math.min(d, 360 - d);
};
const lumOf = (hex: string) => {
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hexOf = (c: string) => {
  const s = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c),
    m = /rgba?\((\d+), (\d+), (\d+)/.exec(c);
  const v = s ? s.slice(1, 4).map((x) => Math.round(Number(x) * 255)) : m ? m.slice(1, 4).map(Number) : null;
  if (!v) throw new Error(`not a colour: ${c}`);
  return `#${v.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

const page_ = (theme: string, devices: unknown[], state: Record<string, unknown>, detail = "near") =>
  `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg width="800" height="600" viewBox="-50 -50 500 400" id="p">${renderFloor(
    floor(devices) as never,
    { scale: 1, theme: theme as never, state: state as never, now: NOW, detail: detail as never },
  )}</svg></body></html>`;

for (const theme of THEMES)
  test(`${theme}: motion has its own colour: not red, not the lights', readable on the room`, async ({ page }) => {
    await page.setContent(
      page_(
        theme,
        [
          { id: "m", type: "motion", entity: "binary_sensor.m", name: "M", x: 100, y: 100 },
          { id: "l", type: "light", entity: "light.l", name: "L", x: 300, y: 100 },
        ],
        { "binary_sensor.m": st("on"), "light.l": st("on") },
        "mid",
      ),
    );
    const r = await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)!;
      const dev = (g: string, v: string) => getComputedStyle(q(g)).getPropertyValue(v).trim();
      return {
        lightDev: dev("g.dev-light", "--fp-dev-light"),
        perimeter: getComputedStyle(q(".motion-perimeter")).stroke,
        badge: getComputedStyle(q("path.rb-motion")).fill,
        room: getComputedStyle(q(".room-room:not([fill])")).fill,
        halo: getComputedStyle(q("g.dev-motion .halo")).fill,
      };
    });
    const motion = hexOf(r.halo),
      light = r.lightDev;
    for (const [k, c] of Object.entries({ halo: r.halo, perimeter: r.perimeter, badge: r.badge }))
      expect(isRed(hexOf(c)), `${theme}: motion ${k} ${hexOf(c)} is not red`).toBe(false);
    expect(hexOf(r.perimeter), "perimeter and badge are the one motion colour").toBe(hexOf(r.badge));
    expect(hexOf(r.perimeter)).toBe(motion);
    expect(hueGap(motion, light), `${theme}: motion ${motion} against the lights' ${light}`).toBeGreaterThanOrEqual(40);
    expect(contrast(motion, hexOf(r.room)), `${theme}: motion on the room`).toBeGreaterThanOrEqual(3);
  });

for (const theme of ["light", "midnight", "solarized", "ha", "blueprint"] as const)
  test(`${theme}: only alert types are drawn red when on (every DeviceType decided)`, async ({ page }) => {
    const types = [...DEVICE_TYPES];
    const devices = types.map((t, i) => ({
      id: t,
      type: t,
      entity: `x.${t}`,
      name: t,
      x: 20 + (i % 8) * 45,
      y: 40 + Math.floor(i / 8) * 60,
    }));
    const state = Object.fromEntries(types.map((t) => [`x.${t}`, st("on")]));
    await page.setContent(page_(theme, devices, state));
    const got = await page.evaluate(
      (ts) =>
        ts.map((t) => {
          const g = document.querySelector(`g.dev-${t}`);
          return [t, g ? getComputedStyle(g).getPropertyValue("--fp-dev").trim() : null] as const;
        }),
      types,
    );
    expect(
      got.filter(([, v]) => v === null).map(([t]) => t),
      "every type is drawn",
    ).toEqual([]);
    const red = got.filter(([, v]) => v && /^#[0-9a-f]{6}$/i.test(v) && isRed(v)).map(([t]) => t);
    for (const t of red) expect(ALERT_TYPES.has(t), `${theme}: ${t} is red but is not an alert type`).toBe(true);
    expect(isRed(DEVICE_COLOURS.motion), "the default motion colour is not red").toBe(false);
  });

test("a motion sensor in a room that lights up adds no second ring; one outside a room keeps its ping; a contact keeps its own", async ({
  page,
}) => {
  await page.setContent(
    page_(
      "light",
      [
        { id: "m", type: "motion", entity: "binary_sensor.m", name: "In", x: 100, y: 100 },
        { id: "o", type: "motion", entity: "binary_sensor.o", name: "Out", x: 900, y: 900 },
        { id: "c", type: "contact", entity: "binary_sensor.c", name: "Contact", x: 300, y: 200 },
      ],
      { "binary_sensor.m": st("on"), "binary_sensor.o": st("on"), "binary_sensor.c": st("on") },
    ),
  );
  const r = await page.evaluate(() => {
    const has = (id: string) => !!document.querySelector(`g.dev[data-x="${id}"] .ping`);
    return {
      perimeters: document.querySelectorAll(".motion-perimeter").length,
      inRoom: has("0"),
      out: has("1"),
      contact: has("2"),
    };
  });
  expect(r.perimeters, "the room has its one outline").toBe(1);
  expect(r.inRoom, "the sensor in the lit room draws no ring of its own").toBe(false);
  expect(r.out, "a sensor outside every room keeps its ping").toBe(true);
  expect(r.contact, "a contact is an alert of its own and keeps its ping").toBe(true);
});
