import { describe, expect, it } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import { celsiusOf, heatBounds, heatT, HEAT_MAX, HEAT_MIN, meanReading, meanValue } from "../../src/core/readings";
import { deviceHeat, FLOORPLAN_CSS, renderFloor, roomReadout, roomReadoutParts } from "../../src/core/render";

// S29 (H1-H3, AC 12): the numbers behind the temperature colours. Untrusted state and config: junk is null or the default, never a throw.
const st = (state: string, unit?: string) => ({
  state,
  attributes: unit === undefined ? {} : { unit_of_measurement: unit },
  last_changed: "2026-10-12T10:00:00Z",
});
const ground = (demo as unknown as Layout).floors.ground;

describe("heatT", () => {
  it("0 at min, .5 in the middle, 1 at max, clamped outside, and a real mix in between", () => {
    expect(heatT(17, 17, 25)).toBe(0);
    expect(heatT(21, 17, 25)).toBe(0.5);
    expect(heatT(25, 17, 25)).toBe(1);
    expect(heatT(10, 17, 25)).toBe(0);
    expect(heatT(40, 17, 25)).toBe(1);
    expect(heatT(19, 17, 25)).toBe(0.25);
  });
  it("null, NaN and Infinity are null; so is a range that is no range", () => {
    expect(heatT(null, 17, 25)).toBeNull();
    expect(heatT(NaN, 17, 25)).toBeNull();
    expect(heatT(Infinity, 17, 25)).toBeNull();
    expect(heatT(20, 25, 17)).toBeNull();
    expect(heatT(20, 20, 20)).toBeNull();
    expect(heatT(20, NaN, 25)).toBeNull();
  });
});

describe("heatBounds", () => {
  it("two finite numbers with min < max are kept", () => expect(heatBounds(16, 26)).toEqual([16, 26]));
  it("min >= max, NaN, Infinity, strings and missing values are 17 and 25", () => {
    expect([HEAT_MIN, HEAT_MAX]).toEqual([17, 25]);
    const junk: [unknown, unknown][] = [
      [26, 16],
      [20, 20],
      [NaN, 25],
      [17, Infinity],
      ["16", "26"],
      [undefined, 26],
      [null, null],
      [{}, []],
    ];
    for (const [a, b] of junk) expect(heatBounds(a, b), JSON.stringify([a, b])).toEqual([17, 25]);
  });
});

describe("meanValue", () => {
  it("is the mean of the finite readings, in the unit of the first readable one", () => {
    expect(meanValue(["s.a", "s.b"], { "s.a": st("20", "°C"), "s.b": st("23", "°C") } as never)).toEqual({
      n: 21.5,
      unit: "°C",
    });
  });
  it("skips junk, missing states and other units; none readable is null", () => {
    const s = { "s.a": st("unavailable", "°C"), "s.b": st("12,5", "°C"), "s.c": st("19", "°C"), "s.d": st("70", "°F") };
    expect(meanValue(["s.a", "s.b", "s.c", "s.d", "s.x"], s as never)).toEqual({ n: 19, unit: "°C" });
    expect(meanValue(["s.a", "s.b"], s as never)).toBeNull();
    expect(meanValue([], s as never)).toBeNull();
    expect(meanValue(["__proto__"], s as never)).toBeNull();
    expect(meanValue(["s.c"], undefined)).toBeNull();
  });
  it("meanReading is built on it and reads exactly as before", () => {
    const s = { "s.a": st("20", "°C"), "s.b": st("23", "°C"), "h.a": st("48", "%"), "n.a": st("21.5") };
    expect(meanReading(["s.a", "s.b"], s as never)).toBe("21.5 °C");
    expect(meanReading(["h.a"], s as never)).toBe("48 %");
    expect(meanReading(["n.a"], s as never)).toBe("21.5");
    expect(meanReading(["s.x"], s as never)).toBe("");
  });
});

describe("celsiusOf", () => {
  it("°C and no unit as they are, °F converted, any other unit none", () => {
    expect(celsiusOf({ n: 21, unit: "°C" })).toBe(21);
    expect(celsiusOf({ n: 21, unit: "" })).toBe(21);
    expect(celsiusOf({ n: 70, unit: "°F" })).toBeCloseTo(21.111, 3);
    expect(celsiusOf({ n: 294, unit: "K" })).toBeNull();
    expect(celsiusOf({ n: NaN, unit: "°C" })).toBeNull();
    expect(celsiusOf(null)).toBeNull();
  });
});

describe("roomReadoutParts", () => {
  const room = { ...ground.rooms[0], temps: ["s.t1", "s.t2"], humidity: ["s.h"] };
  const s = { "s.t1": st("18", "°C"), "s.t2": st("19", "°C"), "s.h": st("48", "%") };
  it("splits the readout and places the temperature between the bounds", () => {
    expect(roomReadoutParts(room as never, s as never, [16, 26])).toEqual({
      temp: "18.5 °C",
      rest: "48 %",
      heat: 0.25,
    });
    expect(roomReadout(room as never, s as never)).toBe("18.5 °C · 48 %");
  });
  it("no bounds, or no temperature, is no heat", () => {
    expect(roomReadoutParts(room as never, s as never).heat).toBeNull();
    expect(roomReadoutParts({ ...room, temps: [] } as never, s as never, [16, 26])).toEqual({
      temp: "",
      rest: "48 %",
      heat: null,
    });
  });
  it("a °F room is coloured by its °C value; a °C sensor listed first wins over a °F one", () => {
    const f = { "s.t1": st("70", "°F"), "s.t2": st("19", "°C") };
    expect(roomReadoutParts({ ...room, temps: ["s.t1"], humidity: [] } as never, f as never, [17, 25])).toEqual({
      temp: "70 °F",
      rest: "",
      heat: 0.51,
    });
    expect(
      roomReadoutParts({ ...room, temps: ["s.t2", "s.t1"], humidity: [] } as never, f as never, [17, 25]).heat,
    ).toBe(0.25);
  });
  it("junk rooms and junk state never throw", () => {
    for (const r of [{}, { temps: 5 }, { temps: [null, 3] }])
      expect(() => roomReadoutParts(r as never, { x: null } as never, [17, 25])).not.toThrow();
  });
});

describe("a temp icon carries its own heat (H5)", () => {
  const i = ground.devices.findIndex((d) => d.type === "temp"); // 4, sensor.demo_living_temperature
  const s = { "sensor.demo_living_temperature": st("18.5", "°C") };
  const group = (svg: string) => svg.match(new RegExp(`<g data-x="${i}"[^>]*>.*?</g>`, "s"))![0];
  it("with tempColors: --fp-temp-t on the group and a halo of class heat", () => {
    const g = group(renderFloor(ground, { scale: 1, state: s as never, tempColors: [16, 26] }));
    expect(g).toMatch(/style="[^"]*--fp-temp-t:0\.25/);
    expect(g).toContain('<circle class="halo heat" cx="12" cy="12" r="16"/>');
    expect(deviceHeat(ground.devices[i]!, { scale: 1, state: s as never, tempColors: [16, 26] })).toBe(0.25);
  });
  it("without tempColors, or with an unreadable state, the markup is as before", () => {
    const plain = renderFloor(ground, { scale: 1, state: s as never });
    expect(plain).not.toContain("--fp-temp-t");
    expect(plain).not.toContain("halo heat");
    const bad = renderFloor(ground, {
      scale: 1,
      state: { "sensor.demo_living_temperature": st("unavailable") } as never,
      tempColors: [16, 26],
    });
    expect(bad).not.toContain("halo heat");
  });
  it("the plug ramp is untouched: a plug keeps --fp-heat, gets no --fp-temp-t, and no theme redefines --fp-heat-*", () => {
    const plug = ground.devices.findIndex((d) => d.type === "plug");
    const svg = renderFloor(ground, {
      scale: 1,
      state: { [ground.devices[plug]!.entity]: st("on") } as never,
      tempColors: [16, 26],
      plugHeat: [0, 2000],
      powerLinks: {},
    });
    expect(svg.match(new RegExp(`<g data-x="${plug}"[^>]*>`))![0]).not.toContain("--fp-temp-t");
    expect(FLOORPLAN_CSS.match(/--fp-heat-mid:/g)).toHaveLength(1);
    expect(FLOORPLAN_CSS).toContain("--fp-heat-cool:#2f86c9;--fp-heat-mid:#f0a020;--fp-heat-hot:#d63a2a");
  });
});

describe("the 2D readout pill (H4)", () => {
  const f = structuredClone(ground);
  Object.assign(f.rooms[0], { temps: ["s.t"], humidity: ["s.h"] });
  Object.assign(f.rooms[6], { humidity: ["s.p"] }); // Garden pond: humidity only
  const s = { "s.t": st("16", "°C"), "s.h": st("48", "%"), "s.p": st("80", "%") };
  it("a room with a temperature draws a pill and its text in a tspan, the text unchanged", () => {
    const svg = renderFloor(f, { scale: 1, state: s as never, tempColors: [16, 26] });
    expect(svg).toMatch(
      /<rect class="val-pill" data-rp="0"[^>]* style="--fp-temp-t:0"\/>\s*<text class="val" data-rv="0"/,
    );
    expect(svg).toContain('<tspan class="val-t">16 °C</tspan> · 48 %</text>');
    expect(svg).not.toContain('data-rp="6"');
  });
  it("no tempColors, or no temperature anywhere, is byte for byte as before", () => {
    expect(renderFloor(f, { scale: 1, state: s as never })).not.toContain("val-pill");
    const g = structuredClone(f);
    g.rooms[0].temps = [];
    g.devices = g.devices.filter((d) => d.type !== "temp");
    expect(renderFloor(g, { scale: 1, state: s as never, tempColors: [16, 26] })).toBe(
      renderFloor(g, { scale: 1, state: s as never }),
    );
  });
  it("labels off draws no pill", () => {
    expect(renderFloor(f, { scale: 1, state: s as never, tempColors: [16, 26], labels: false })).not.toContain(
      "val-pill",
    );
  });
});
