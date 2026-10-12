# Layers in 3D, Cover Art, Temperature Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone user reads three things at a glance on the card: which device families are shown (Layers now work in live 3D), what each speaker is playing (its cover art in place of its icon, 2D and 3D), and how warm each room is (the temperature on a coloured pill, a temperature icon with a ring in that colour).

**Architecture:** Everything visible stays on the one draw path (finding 8): `renderFloor` and `deviceMarkup` in `src/core/render.ts` decide the 2D markup and the icon markup the 3D overlay reuses; `liveOf` (`src/core/live-build.ts`) decides the 3D live state from the same helpers. New pure core: `artUrl` (`src/core/schema.ts`, beside `TRACE_SRC`), `meanValue`, `celsiusOf`, `heatBounds`, `heatT` (`src/core/readings.ts`), `roomReadoutParts` and `deviceHeat` (`src/core/render.ts`). The colour is a number on the element (`--fp-temp-t`, 0..1) that one stylesheet rule turns into a colour from three theme tokens (the plug ramp's precedent, `render.ts:683`), so 2D and 3D cannot differ. The card wires YAML keys, View options picks and a bounded failed-image set into both views.

**Tech Stack:** TypeScript, Lit, vitest (jsdom for card units), Playwright (Chromium), three.js (only `view3d.ts` and `pick.ts` touched).

**Spec:** `docs/specs/layers-art-heat.md` (approved). Read it first. Where this plan departs from its wording, the reason is in "Spec decisions taken in this plan" below and goes into `docs/DECISIONS.md` in the task that does it.

## Global Constraints

- No runtime network beyond Home Assistant: the only outside value is the art URL, and it passes `artUrl` (same origin, relative path only).
- Colours only through `--fp-*` tokens; no hex in code outside the token blocks (finding 9).
- Escape every interpolated string in markup, `kind`/`type`/href included; test with `"><script>` (finding 2).
- One draw path: 2D marks from `renderFloor`/`deviceMarkup`, 3D live state from core `live-build.ts`; the overlay draws what core hands it (finding 8).
- Layout, state and card config are untrusted: nothing throws, junk is the default (findings 1, 12).
- English in files, metric units, ISO dates.
- `docs/DECISIONS.md`, `FORK.md` and `CHANGELOG.md` lines go in the same commit as the work they describe.
- One branch per task, `task/s29-<n>` (n = the S29 number), each in its own worktree with its own `PW_PORT`.
- Coding agents run on Sonnet; Opus reviews the integrated build once (`docs/WORKFLOW.md`).
- Playwright is scoped per task: the task's own specs plus the specs that grep the changed code (lists below); full suite only at integration. A new Playwright test runs `--repeat-each=10` before it is committed (finding 13).
- Run each command bare and read `$?` on its own line (finding 14). Never report green you did not see (finding 7).
- Write each test first and watch it fail (finding 5); prove a test needs its feature by reverting only the source file once (finding 4).
- Every CSS rule that matters gets a `getComputedStyle` pair (findings 10, 18); any task that touches `render.ts` or a stylesheet runs `npm run shots` and looks (finding 16).

## Spec decisions taken in this plan

1. **Token names.** The spec's `--fp-heat-cold/mid/hot` and per-element `--fp-heat` collide with the plug ramp: `--fp-heat-mid` and `--fp-heat-hot` already exist as fixed hues (`render.ts:468`, S14.8) and `--fp-heat` is a plug's 0..1 draw read by `.dev-plug.on[style*="--fp-heat"]` (`render.ts:683`). Redefining them per theme would recolour every plug. The temperature tokens are `--fp-temp-cold`, `--fp-temp-mid`, `--fp-temp-hot`; the per-element value is a number `--fp-temp-t` (0..1); one rule makes `--fp-temp` (the colour) from it. AC 17 is checked against these names.
2. **The colour is mixed in CSS, not in JS.** A theme token can be `var(--primary-text-color, …)` (the `ha` theme) or come from `rolesToTokens`; JS cannot know its value, so core writes the number and the stylesheet mixes (as the plug ramp does).
3. **Units.** `°C` and an empty unit are °C (existing tests and fixtures carry temperatures with no unit, e.g. `card-3d-chips.spec.ts`); `°F` is converted; any other unit gives no colour (the text is unchanged).
4. **One `error` listener.** A capturing `error` listener on the card's shadow root (`this.renderRoot`) sees an `<image>` failing in the plan `<svg>` and in the 3D overlay (both live in that shadow root), so the spec's two listeners are one.
5. **The clip id needs the device index.** `deviceMarkup` gets an optional `index` argument; art is drawn only when it is given (both callers give it).
6. **At `far` the art's ring is undone too** (`[data-detail="far"] g.dev.art .halo{fill-opacity:1;stroke:none}`), else the far dot is a hollow ring round a half-size glyph.
7. **The temp ring keeps the disc.** H5 says "the art ring's rule shape"; the art rule clears the halo fill, which would change a temp icon's look. The temp ring sets stroke only. The 3D overlay's idle-disc rule (6 classes) outranks a 2D-strength ring rule, so the overlay gets its own ring rule.
8. **AC 13 uses one more room.** Rooms at 16, 21 and 26 °C with bounds 16 and 26 give t = 0, 0.5, 1, which are the bare tokens and prove no mixing (finding 4). The test adds a room at 18.5 °C (t = 0.25).
9. **AC 1 reads the overlay's DOM.** `overlay.state()` is not on the test hook; the test reads `svg.fp3-ic[data-i]` and the group's `dev-<type>` class, as `card-3d-off-devices.spec.ts` does.
10. **AC 5 / AC 7 LAN address.** Tests use the generic `http://192.168.1.10:8095/imageproxy/x` (public repo, CLAUDE.md rule 1); the spec already says so.
11. **Hidden devices are not tappable in 3D.** The spec hides icon, ball, body and pool but says nothing of the picker, whose proxy balls and bodies would still open a hidden lamp's popup. `Picker.pick` gets a `skip` predicate (S29.3).
12. **3D readout text.** The pill keeps the readout's own text colour (2D `.val`, 3D `.fp3-val`); the readout text is unchanged character for character, as AC 13 asks.

## Review Focus

Five inputs not covered by the spec's ACs, each pinned by a test in its owning task:

1. **A tap where a hidden lamp hangs in 3D** must pick the room, not open the lamp's popup (the picker's proxy ball and a body are still in the scene). Pinned in S29.3: `three-pick.test.ts` "skipped, the ray reaches the room under it" and `card-3d-layers.spec.ts` "a tap where a hidden light hangs picks its room".
2. **The plug ramp must not move.** New tokens next to `--fp-heat-*` must not redefine them, and a plug with `tempColors` set keeps `--fp-heat` and gets no `--fp-temp-t`. Pinned in S29.1: `temp-colour.test.ts` "the plug ramp is untouched" and `temp-tokens.spec.ts` (every theme still resolves `--fp-heat-mid` to `#f0a020`).
3. **An idle temp icon in 3D** sits under the overlay's idle-disc rule (`.fp3-ic g.dev:not(.on):not(.danger):not(.unavailable) .halo`, specificity 6 classes), which outranks a plain ring rule. Pinned in S29.5: `card-3d-temp.spec.ts` "the temp icon's ring in 3D" reads the computed stroke on the overlay.
4. **Mixed units and °F.** A room listing a °C sensor first and a °F sensor second means the °C one only; a °F-only room is coloured by its °C value. Pinned in S29.1: `temp-colour.test.ts` "a °F room is coloured by its °C value" and "skips other units".
5. **Failed-art churn.** Untrusted state can rotate art URLs; the failed set stays at 64, drops the oldest, a dropped href is tried again, and one failure causes one re-render (no loop). Pinned in S29.6: `card-art-failed.test.ts`.

---

## Task S29.1 (Group A): temperature maths, tokens and the colour rule

Branch `task/s29-1`, `PW_PORT=5274`. Parallel with S29.2 and S29.3.

(Adjusted from the brief: this task also produces `roomReadoutParts`, `deviceHeat`, the `--fp-temp` mixing rule and the card's `_tempColors()` wiring, because S29.4 and S29.5 both consume them and must run in parallel.)

**Files:**
- Modify: `src/core/readings.ts` (whole file, 33 lines)
- Modify: `src/core/render.ts`: `RenderOpts` (add after `plugHeat`, line 117); token blocks `LIGHT_TOKENS` (245-248), `MIDNIGHT_TOKENS` (260-263), `SOLARIZED_TOKENS` (365-368); `FLOORPLAN_CSS` (after line 468); `roomReadout` (1380-1385); `deviceMarkup` (1504-1584: style and halo)
- Modify: `src/core/theme-roles.ts` (`rolesToTokens`, 121-208)
- Modify: `src/core/index.ts` (export the new names)
- Modify: `src/card/floorplan-studio-card.ts`: config interface (after `plug_heat_to`, line 173); `_tempColors()` after `_plugHeat()` (1383-1385); `setLive` options (2054-2072); `renderFloor` options (4050-4078)
- Create: `tests/core/temp-colour.test.ts`, `tests/card/temp-tokens.spec.ts`, `tests/card/card-temp-config.test.ts`
- Modify: `tests/core/theme-roles.test.ts` (the `wanted` list, line 25)
- Records: `CHANGELOG.md`, `FORK.md`, `docs/DECISIONS.md`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // src/core/readings.ts
  export interface MeanValue { n: number; unit: string }
  export function meanValue(list: string[], state: StateOverlay | undefined): MeanValue | null;
  export function meanReading(list: string[], state: StateOverlay | undefined): string; // signature unchanged
  export function celsiusOf(v: MeanValue | null): number | null;
  export const HEAT_MIN = 17, HEAT_MAX = 25;
  export function heatBounds(min: unknown, max: unknown): [number, number];
  export function heatT(value: number | null, min: number, max: number): number | null;
  // src/core/render.ts
  RenderOpts.tempColors?: readonly [number, number];
  export interface ReadoutParts { temp: string; rest: string; heat: number | null }
  export function roomReadoutParts(r: Floor["rooms"][number], state: StateOverlay | undefined, bounds?: readonly [number, number]): ReadoutParts;
  export function deviceHeat(d: Device, o: RenderOpts): number | null;
  // deviceMarkup: a `temp` device with o.tempColors and a readable state gets style `--fp-temp-t:<t>` and `<circle class="halo heat" …>`
  // CSS: --fp-temp-cold/-mid/-hot in every theme; `.val-pill,.halo.heat{--fp-temp:<mix of the three by --fp-temp-t>}`
  // src/card/floorplan-studio-card.ts
  FloorplanStudioCardConfig.temp_colors?: boolean; heat_min?: number; heat_max?: number;
  private _tempColors(): [number, number] | undefined; // passed as `tempColors` to renderFloor and setLive
  ```
  `heat` and `--fp-temp-t` are rounded to 0.01 so 2D, 3D and the 3D change signature agree.

- [ ] **Step 1: Write the failing unit test** — `tests/core/temp-colour.test.ts`:

```ts
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
    expect(roomReadoutParts({ ...room, temps: ["s.t2", "s.t1"], humidity: [] } as never, f as never, [17, 25]).heat).toBe(
      0.25,
    );
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
```

Note on the plug case: the demo plug has no power sensor in this state, so `--fp-heat` is not written either; the assertion that matters is "no `--fp-temp-t` on the plug" and the CSS count. Do not invent a power sensor to make the first `expect` stronger.

- [ ] **Step 2: Run it, see it fail**

Run: `npx vitest run tests/core/temp-colour.test.ts`
Expected: FAIL, `celsiusOf`/`heatBounds`/`heatT`/`meanValue` are not exported from `readings.ts` (and `roomReadoutParts`, `deviceHeat` not from `render.ts`).

- [ ] **Step 3: Implement the maths** — replace the body of `src/core/readings.ts` below `stateOf` with:

```ts
/** A mean reading and the unit it was read in (the unit of the first readable sensor). */
export interface MeanValue {
  n: number;
  unit: string;
}

/** S29 (H1): the mean of the readable states of `list`, in the unit of the first one read; null when none is readable.
 *  Readings in any other unit are left out, not converted: a mean of 21 °C and 70 °F (45.5) means nothing. `meanReading`
 *  is built on this, so a room's text and its colour can never come from different numbers. */
export function meanValue(list: string[], state: StateOverlay | undefined): MeanValue | null {
  const all = (Array.isArray(list) ? list : []).flatMap((e) => {
    const s = stateOf(state, e),
      t = s?.state.trim() ?? "";
    return s && /^-?\d+(\.\d+)?$/.test(t) && Number.isFinite(Number(t))
      ? [
          {
            n: Number(t),
            unit: typeof s.attributes?.unit_of_measurement === "string" ? s.attributes.unit_of_measurement : "",
          },
        ]
      : [];
  });
  if (!all.length) return null;
  const unit = all[0]!.unit,
    rs = all.filter((r) => r.unit === unit);
  return { n: rs.reduce((n, r) => n + r.n, 0) / rs.length, unit };
}

/** Mean of the readable states of `list`, rounded to 0.1 without a trailing zero (`meanText`, so 48 reads "48 %" like a single sensor; S23.1: a narrow no-break space before the unit, so a value never wraps between the two), in the unit of the first one read; "" when none is readable.
 *  The one function behind a room's readout on the plan (`renderFloor`), in 3D and in the card's left panel. */
export function meanReading(list: string[], state: StateOverlay | undefined): string {
  const m = meanValue(list, state);
  return m ? `${meanText(m.n)}${m.unit ? ` ${m.unit}` : ""}` : "";
}

/** S29 (H1): a mean temperature in °C for the colour scale. °C and no unit (a template sensor often has none) as read, °F
 *  converted; any other unit, or no reading, is null: the text still shows, uncoloured. */
export function celsiusOf(v: MeanValue | null): number | null {
  if (!v || !Number.isFinite(v.n)) return null;
  const u = v.unit.trim();
  if (u === "°F" || u === "℉") return ((v.n - 32) * 5) / 9;
  return u === "°C" || u === "℃" || u === "" ? v.n : null;
}

/** S29 (H2): the fixed comfort scale's ends, °C. */
export const HEAT_MIN = 17,
  HEAT_MAX = 25;

/** The card's `heat_min`/`heat_max`: two finite numbers with min < max, else both are the defaults. Untrusted YAML, never a throw. */
export function heatBounds(min: unknown, max: unknown): [number, number] {
  return typeof min === "number" &&
    typeof max === "number" &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min < max
    ? [min, max]
    : [HEAT_MIN, HEAT_MAX];
}

/** Where `value` (°C) sits on the scale: 0 at `min` or below, 1 at `max` or above. Null for no value or a range that is no range. */
export function heatT(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || !(min < max))
    return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
```

- [ ] **Step 4: Implement the render side** in `src/core/render.ts`:

  a. Import: change line 24 to `import { celsiusOf, heatBounds, heatT, meanReading, meanValue } from "./readings";`.

  b. `RenderOpts`, after `plugHeat` (line 117):
  ```ts
  /** S29 (H2-H5): the temperature colour scale [cold, hot] in °C (`heatBounds`). A room's readout puts its temperature on a
   *  pill and a temp icon wears a ring, both carrying `--fp-temp-t` (0..1) that the stylesheet turns into a colour. Omitted
   *  (the editor, or the card's switch off), nothing is written and the markup is byte for byte as before. */
  tempColors?: readonly [number, number];
  ```

  c. Replace `roomReadout` (1380-1385) with:
  ```ts
  /** S29 (H4, H6): a room's readout in parts: the mean temperature, the rest (humidity), and where the temperature sits on
   *  `bounds` (0..1, rounded to 0.01), or null with no bounds, no temperature or a unit that is not a temperature. */
  export interface ReadoutParts {
    temp: string;
    rest: string;
    heat: number | null;
  }
  export function roomReadoutParts(
    r: Floor["rooms"][number],
    state: StateOverlay | undefined,
    bounds?: readonly [number, number],
  ): ReadoutParts {
    const temps = roomList(r, "temps"),
      temp = meanReading(temps, state),
      rest = meanReading(roomList(r, "humidity"), state);
    let heat: number | null = null;
    if (bounds && temp) {
      const [min, max] = heatBounds(bounds[0], bounds[1]),
        t = heatT(celsiusOf(meanValue(temps, state)), min, max);
      heat = t === null ? null : Math.round(t * 100) / 100;
    }
    return { temp, rest, heat };
  }
  /** S11.1: the readout of a room's own sensors: the mean temperature and humidity, as the plan prints them under the room's name. "" when nothing is readable. */
  export function roomReadout(r: Floor["rooms"][number], state: StateOverlay | undefined): string {
    const { temp, rest } = roomReadoutParts(r, state);
    return [temp, rest].filter(Boolean).join(" · ");
  }
  /** S29 (H5): a temp icon's place on the scale, from its own state; null for any other type, no `tempColors` or no reading. */
  export function deviceHeat(d: Device, o: RenderOpts): number | null {
    if (d?.type !== "temp" || !o.tempColors) return null;
    const [min, max] = heatBounds(o.tempColors[0], o.tempColors[1]),
      t = heatT(celsiusOf(meanValue([d.entity], o.state)), min, max);
    return t === null ? null : Math.round(t * 100) / 100;
  }
  ```
  `roomList` (1367-1368) already turns a list field that is not a list into `[]`; the junk-room test passes objects, as every caller does.

  d. In `deviceMarkup`, after the S14.8 plug block (around line 1545):
  ```ts
  // S29 (H5): a temp icon's place on the comfort scale; the stylesheet's `.halo.heat` rule turns it into the ring's colour.
  const heat = deviceHeat(d, o);
  if (heat !== null) style.push(`--fp-temp-t:${num(heat)}`);
  ```
  and in the `icon` line (1583) replace `<circle class="halo" cx="12" cy="12" r="16"/>` with `<circle class="halo${heat !== null ? " heat" : ""}" cx="12" cy="12" r="16"/>`.

  e. Tokens. Append to the last line of `LIGHT_TOKENS` (before the closing backtick, after `--fp-open-door:var(--fp-dev-contact)`): `;--fp-temp-cold:#2f78b8;--fp-temp-mid:#9a958b;--fp-temp-hot:#c8412f`. Same place in `MIDNIGHT_TOKENS`: `;--fp-temp-cold:#5fa8e8;--fp-temp-mid:#8b8578;--fp-temp-hot:#f0604d`. After `--fp-text-out:#eee8d5` in `SOLARIZED_TOKENS`: `;--fp-temp-cold:#268bd2;--fp-temp-mid:#657b83;--fp-temp-hot:#dc322f`. `HA_LIGHT` and `HA_DARK` are built on `LIGHT_TOKENS` and `MIDNIGHT_TOKENS`, so they follow. The values are first picks; S29.4 judges them in the shots and may tune them (tests pin resolution and distinctness, not the hex).

  f. `FLOORPLAN_CSS`, right after the plug ramp line (468):
  ```css
  /* S29 (H3): a room's temperature pill and a temp icon's ring. renderFloor writes --fp-temp-t (0..1); 0 to .5 mixes cold into mid,
     .5 to 1 mid into hot, the plug ramp's shape (S14.8). The --fp-temp-* tokens are per theme; the plug's --fp-heat-* stay fixed. */
  .val-pill,.halo.heat{--fp-temp:color-mix(in srgb,color-mix(in srgb,var(--fp-temp-cold) calc((1 - min(var(--fp-temp-t) * 2,1)) * 100%),var(--fp-temp-mid)) calc((1 - max(var(--fp-temp-t) * 2 - 1,0)) * 100%),var(--fp-temp-hot))}
  ```

- [ ] **Step 5: `rolesToTokens`** — in `src/core/theme-roles.ts`, after the `--fp-dev-speaker` line add:
  ```ts
    // S29 (H3): the temperature scale. Fixed hues per light or dark kind, like the TV and speaker blues: a one-accent theme must still
    // read cold from hot. Mid is the neutral the pill passes through.
    `--fp-temp-cold:${roles.dark ? "#5fa8e8" : "#2f78b8"}`,
    `--fp-temp-mid:${roles.dark ? "#8b8578" : "#9a958b"}`,
    `--fp-temp-hot:${roles.dark ? "#f0604d" : "#c8412f"}`,
  ```
  and add `"--fp-temp-cold", "--fp-temp-mid", "--fp-temp-hot"` to `wanted` in `tests/core/theme-roles.test.ts` (line 25).

- [ ] **Step 6: Exports** — `src/core/index.ts`: add `export { HEAT_MAX, HEAT_MIN, celsiusOf, heatBounds, heatT, meanValue } from "./readings"; export type { MeanValue } from "./readings";` beside the `state-text` export (line 120), and add `deviceHeat`, `roomReadoutParts` and `type ReadoutParts` to the existing `./render` export list.

- [ ] **Step 7: Run the unit tests, see them pass**

Run: `npx vitest run tests/core/temp-colour.test.ts tests/core/theme-roles.test.ts tests/core/state-text.test.ts tests/core/label-style.test.ts tests/core/room-info.test.ts tests/core/render.test.ts`
Then `echo $?` on its own line. Expected 0. The render snapshot must not change (no caller passes `tempColors` yet); if it does, stop and report.

- [ ] **Step 8: Write the failing token spec (AC 17)** — `tests/card/temp-tokens.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { FLOORPLAN_CSS, THEMES } from "../../src/core/render";

// S29 (H3, AC 17): the temperature tokens and the mixing rule, read back from Chromium in every theme and in Home Assistant dark
// (finding 17: the whole union, never a subset). Colours are resolved on a canvas, so any CSS colour syntax compares as 0..255.
const CASES = [...THEMES.map((t) => ({ t, mode: "light" })), { t: "ha", mode: "dark" }] as const;
const body =
  `<rect class="p-cold" style="fill:var(--fp-temp-cold)"/><rect class="p-mid" style="fill:var(--fp-temp-mid)"/>` +
  `<rect class="p-hot" style="fill:var(--fp-temp-hot)"/>` +
  `<rect class="val-pill p-q1" style="--fp-temp-t:0.25;fill:var(--fp-temp)"/>` +
  `<rect class="val-pill p-q3" style="--fp-temp-t:0.75;fill:var(--fp-temp)"/>`;

async function read(page: Page) {
  await page.setContent(
    `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg>${CASES.map((c, i) => `<g id="c${i}" data-theme="${c.t}" data-mode="${c.mode}">${body}</g>`).join("")}</svg></body></html>`,
  );
  return page.evaluate((n) => {
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "#000";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    return Array.from({ length: n }, (_, i) => {
      const g = document.getElementById(`c${i}`)!,
        f = (s: string) => rgb(getComputedStyle(g.querySelector(s)!).fill);
      return {
        raw: ["--fp-temp-cold", "--fp-temp-mid", "--fp-temp-hot"].map((k) => getComputedStyle(g).getPropertyValue(k).trim()),
        plugMid: getComputedStyle(g).getPropertyValue("--fp-heat-mid").trim(),
        cold: f(".p-cold"),
        mid: f(".p-mid"),
        hot: f(".p-hot"),
        q1: f(".p-q1"),
        q3: f(".p-q3"),
      };
    });
  }, CASES.length);
}
const half = (a: number[], b: number[]) => a.map((v, k) => (v + b[k]!) / 2);
const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) <= 2);
const far = (a: number[], b: number[]) => a.reduce((s, v, k) => s + Math.abs(v - b[k]!), 0) > 60;

test("AC 17: every theme, HA light and dark included, declares --fp-temp-cold, -mid and -hot, three distinct colours", async ({
  page,
}) => {
  const r = await read(page);
  CASES.forEach((c, i) => {
    const tag = `${c.t}/${c.mode}`;
    for (const v of r[i]!.raw) expect(v, `${tag}: declared`).not.toBe("");
    expect(far(r[i]!.cold, r[i]!.hot), `${tag}: cold and hot differ`).toBe(true);
    expect(far(r[i]!.cold, r[i]!.mid) && far(r[i]!.mid, r[i]!.hot), `${tag}: mid differs from both`).toBe(true);
  });
});

test("the rule mixes by --fp-temp-t: .25 is half cold, half mid; .75 half mid, half hot", async ({ page }) => {
  const r = await read(page);
  CASES.forEach((c, i) => {
    const v = r[i]!;
    expect(near(v.q1, half(v.cold, v.mid)), `${c.t}/${c.mode} q1 ${v.q1} vs ${half(v.cold, v.mid)}`).toBe(true);
    expect(near(v.q3, half(v.mid, v.hot)), `${c.t}/${c.mode} q3 ${v.q3} vs ${half(v.mid, v.hot)}`).toBe(true);
  });
});

test("Review focus 2: the plug ramp's fixed hues are the same in every theme", async ({ page }) => {
  const r = await read(page);
  CASES.forEach((c, i) => expect(r[i]!.plugMid, `${c.t}/${c.mode}`).toBe("#f0a020"));
});
```

Run before Step 4 is in place (or with the token lines reverted): `PW_PORT=5274 npx playwright test tests/card/temp-tokens.spec.ts`, then `echo $?`. Expected: FAIL, `declared` is "" for every theme. With the work in: PASS. Then `PW_PORT=5274 npx playwright test tests/card/temp-tokens.spec.ts --repeat-each=10`, `echo $?`, expected 0.

- [ ] **Step 9: Write the failing card wiring test** — `tests/card/card-temp-config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// S29 (S3, H2): the card hands renderFloor the comfort scale from its YAML. renderFloor is wrapped, not replaced (card-view-memory.test.ts's trick).
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const lastOpts = () => (renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts;
async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks(); // spies first, then the clock (finding 15)
  vi.useRealTimers();
  localStorage.clear();
});

describe("temp_colors, heat_min, heat_max (S29)", () => {
  it("on by default, at 17 and 25", async () => {
    await mount();
    expect(lastOpts().tempColors).toEqual([17, 25]);
  });
  it("the YAML bounds are used when they are a range", async () => {
    await mount({ heat_min: 16, heat_max: 26 });
    expect(lastOpts().tempColors).toEqual([16, 26]);
  });
  it("bad bounds are 17 and 25", async () => {
    for (const [a, b] of [
      [26, 16],
      ["16", 26],
      [NaN, 26],
    ] as const) {
      const el = await mount({ heat_min: a as never, heat_max: b as never });
      expect(lastOpts().tempColors, JSON.stringify([a, b])).toEqual([17, 25]);
      el.remove();
    }
  });
  it("temp_colors: false is off; junk is on", async () => {
    const off = await mount({ temp_colors: false });
    expect(lastOpts().tempColors).toBeUndefined();
    off.remove();
    for (const v of ["no", 0, null, "false"]) {
      const el = await mount({ temp_colors: v as never });
      expect(lastOpts().tempColors, JSON.stringify(v)).toEqual([17, 25]);
      el.remove();
    }
  });
});
```

Run: `npx vitest run tests/card/card-temp-config.test.ts`; expected FAIL (`tempColors` undefined), then implement Step 10.

- [ ] **Step 10: Card wiring** in `src/card/floorplan-studio-card.ts`:
  - Config interface, after `plug_heat_to?: number;` (line 173):
  ```ts
  /** S29: `false` draws no temperature colours (the readout's pill, a temp icon's ring); anything else is on (default). The View options' Temperature colours button changes it for one viewer. */
  temp_colors?: boolean;
  /** S29: the comfort scale in °C, blue at `heat_min` (17), neutral half way, red at `heat_max` (25). Two numbers with min below max; anything else is 17 and 25. */
  heat_min?: number;
  heat_max?: number;
  ```
  - Import `heatBounds` from `"../core"` (the import list at lines 28-96).
  - After `_plugHeat()` (1383-1385):
  ```ts
  /** S29 (H2, S3): the temperature colour scale handed to both views, or undefined when the colours are off. Untrusted YAML: only a real `false` is off. */
  private _tempColors(): [number, number] | undefined {
    return this._config.temp_colors !== false ? heatBounds(this._config.heat_min, this._config.heat_max) : undefined;
  }
  ```
  - Add `tempColors: this._tempColors(),` after `plugHeat: this._plugHeat(),` in both the `setLive` options (line 2062) and the `renderFloor` options (line 4060).

- [ ] **Step 11: Run unit and scoped Playwright tests**

Run: `npx vitest run`, then `echo $?`. Expected 0.
Run: `npm run typecheck`, `echo $?`; `npm run lint`, `echo $?`; `npm run format:check`, `echo $?`. Each 0.
Run (scoped; found by `grep -lE "\.halo|dev-temp|fp-heat|--fp-tree|THEMES" tests/card/*.spec.ts`):
`PW_PORT=5274 npx playwright test tests/card/temp-tokens.spec.ts tests/card/plug-heat.spec.ts tests/card/polish-tokens.spec.ts tests/card/theme-surfaces.spec.ts tests/card/device-states-css.spec.ts tests/card/detail-css.spec.ts tests/card/card-3d-off-devices.spec.ts tests/card/card.spec.ts tests/card/size-budget.spec.ts`
Then `echo $?`. Expected 0.

- [ ] **Step 12: Break it once (finding 4).** In a throwaway worktree (or `git stash push -- src/core/render.ts`), drop the `.val-pill,.halo.heat{…}` rule; `temp-tokens.spec.ts` "the rule mixes" fails. Restore.

- [ ] **Step 13: Records.**
  - `CHANGELOG.md` under `## Unreleased`: `- Temperature colours, groundwork: three per-theme tokens (\`--fp-temp-cold\`, \`-mid\`, \`-hot\`) and the card keys \`temp_colors\`, \`heat_min\`, \`heat_max\` (default on, 17 and 25 °C). Nothing is drawn with them yet.`
  - `FORK.md`, new top entry: `## 2026-10-12: Sprint 29, temperature scale (branch \`task/s29-1\`)` with one bullet: `- \`meanValue\`, \`heatT\`, \`heatBounds\`, \`celsiusOf\` in \`src/core/readings.ts\`; \`roomReadoutParts\`, \`deviceHeat\`, the \`--fp-temp-*\` tokens and their mixing rule in \`src/core/render.ts\` and \`theme-roles.ts\`; card keys \`temp_colors\`, \`heat_min\`, \`heat_max\`.`
  - `docs/DECISIONS.md`, new top entry:
  ```markdown
  ## 2026-10-12: temperature colours are --fp-temp-*, mixed in CSS (Sprint 29)

  The spec named the tokens `--fp-heat-cold/mid/hot` and the per-element colour `--fp-heat`. Both collide with the plug ramp:
  `--fp-heat-mid` and `--fp-heat-hot` are fixed hues there (S14.8) and `--fp-heat` is a plug's 0..1 draw, read by
  `.dev-plug.on[style*="--fp-heat"]`. The temperature tokens are `--fp-temp-cold`, `--fp-temp-mid` and `--fp-temp-hot`, per
  theme. Core writes a number, `--fp-temp-t` (0..1, rounded to 0.01), and one rule (`.val-pill,.halo.heat`) mixes the colour:
  a theme token can be one of Home Assistant's own variables, which JS cannot read. Units: °C and no unit are °C, °F is
  converted, any other unit gives no colour (the text is unchanged).
  ```

- [ ] **Step 14: Commit**

```bash
git add src/core/readings.ts src/core/render.ts src/core/theme-roles.ts src/core/index.ts src/card/floorplan-studio-card.ts tests/core/temp-colour.test.ts tests/core/theme-roles.test.ts tests/card/temp-tokens.spec.ts tests/card/card-temp-config.test.ts CHANGELOG.md FORK.md docs/DECISIONS.md
git commit -m "Add the temperature scale, its tokens and the card keys"
```
Body: why (one scale behind the 2D pill, the 3D pill and the ring; plug ramp left alone), and that the readout text is unchanged.

---

## Task S29.2 (Group A): `artUrl`, the art in the icon markup, and its CSS

Branch `task/s29-2`, `PW_PORT=5275`. Parallel with S29.1 and S29.3.

**Files:**
- Modify: `src/core/schema.ts` (after `TRACE_SRC`, line 162)
- Modify: `src/core/render.ts`: `RenderOpts` (after `plugHeat`, line 117); `DeviceMarkup` (1493-1502); `deviceMarkup` signature and body (1504-1584); its call in `renderFloor` (2508); `FLOORPLAN_CSS` (the `.dev .halo` group, 691, and the S25.2 far block, 761-775)
- Modify: `src/core/live-build.ts:138` (pass the index)
- Modify: `src/card/floorplan-studio-card.ts`: config interface (after `floors_below`, 238); `_mediaArt()` after `_names()` (1651-1653); `setLive` (2054-2072) and `renderFloor` (4050-4078) options
- Create: `tests/core/art.test.ts`, `tests/card/art-css.spec.ts`, `tests/card/card-art-config.test.ts`
- Records: `CHANGELOG.md`, `FORK.md`, `docs/DECISIONS.md`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // src/core/schema.ts
  export const MAX_ART_URL = 2048;
  export const ART_SRC: RegExp; // /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*$/
  export function artUrl(attributes: unknown): string | null;
  // src/core/render.ts
  RenderOpts.mediaArt?: boolean;                  // omitted or false: no art, byte for byte as before
  RenderOpts.artFailed?: ReadonlySet<string>;     // hrefs that failed to load: drawn as the glyph
  DeviceMarkup.art: string | null;                // the href drawn, or null
  export function deviceMarkup(f: Floor, d: Device, o: RenderOpts, now: number, floorAt: Pt, quiet?: boolean, index?: number): DeviceMarkup;
  // markup when art is drawn: cls gains " art"; icon = …<circle class="halo" …/><path d="…"/><clipPath id="fp-art-<index>"><circle cx="12" cy="12" r="16"/></clipPath><image class="art" href="<esc(url)>" x="-4" y="-4" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#fp-art-<index>)"/>…
  // src/card/floorplan-studio-card.ts
  FloorplanStudioCardConfig.media_art?: boolean;
  private _mediaArt(): boolean; // passed as `mediaArt` to renderFloor and setLive
  ```

- [ ] **Step 1: Write the failing unit test** — `tests/core/art.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import { artUrl, MAX_ART_URL } from "../../src/core/schema";
import { renderFloor } from "../../src/core/render";
import { liveOf } from "../../src/core/live";

// S29 (A1-A5, AC 5, AC 6): the art URL is the one outside value on the plan; only a same-origin relative path passes.
const OK = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=3f2a";
const NOW = Date.parse("2026-10-12T10:00:00Z");

describe("artUrl (AC 5)", () => {
  it("entity_picture_local wins", () =>
    expect(artUrl({ entity_picture_local: OK, entity_picture: "/api/b.png" })).toBe(OK));
  it("a relative entity_picture is the fallback, also when the local one is refused", () => {
    expect(artUrl({ entity_picture: "/api/x.png" })).toBe("/api/x.png");
    expect(artUrl({ entity_picture_local: "//h/x", entity_picture: "/api/x.png" })).toBe("/api/x.png");
  });
  const REFUSED: unknown[] = [
    "//h/x",
    "/\\h/x",
    "javascript:x",
    "data:image/png;base64,x",
    '"><script>',
    '/"><script>',
    "/" + "a".repeat(2999),
    "http://192.168.1.10:8095/imageproxy/x",
    "",
    "/a b",
    42,
    null,
  ];
  it.each(REFUSED.map((v) => [JSON.stringify(v).slice(0, 40), v]))("%s is refused", (_, v) =>
    expect(artUrl({ entity_picture_local: v, entity_picture: v })).toBeNull(),
  );
  it("2048 characters is the limit", () => {
    expect(artUrl({ entity_picture: "/" + "a".repeat(MAX_ART_URL - 1) })).not.toBeNull();
    expect(artUrl({ entity_picture: "/" + "a".repeat(MAX_ART_URL) })).toBeNull();
  });
  it("junk attributes are null, never a throw", () => {
    for (const a of [null, undefined, 5, "x", [], Object.create(null)]) expect(artUrl(a)).toBeNull();
  });
});

describe("the art on a device icon (A3, A5, AC 6)", () => {
  const f = structuredClone((demo as unknown as Layout).floors.ground);
  f.devices.push({ id: "spk", type: "speaker", entity: "media_player.kitchen", name: "Kitchen speaker", x: 700, y: 300 } as never);
  const SPK = f.devices.length - 1; // 12
  const at = (state: string, attributes: Record<string, unknown> = { entity_picture_local: OK }) => ({
    "media_player.kitchen": { state, attributes, last_changed: "2026-10-12T10:00:00Z" },
  });
  const group = (svg: string) => svg.match(new RegExp(`<g data-x="${SPK}"[^>]*>.*?</g>`, "s"))![0];
  const draw = (state: ReturnType<typeof at>, extra: object = {}) =>
    group(renderFloor(f, { scale: 1, now: NOW, state: state as never, mediaArt: true, ...extra }));

  it("a playing speaker draws image.art after the glyph, clipped to the halo's circle", () => {
    const g = draw(at("playing"));
    expect(g).toMatch(new RegExp(`^<g data-x="${SPK}" class="dev dev-speaker on art"`));
    expect(g).toContain(
      `<clipPath id="fp-art-${SPK}"><circle cx="12" cy="12" r="16"/></clipPath><image class="art" href="${OK.replace(/&/g, "&amp;")}" x="-4" y="-4" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#fp-art-${SPK})"/>`,
    );
    expect(g.indexOf("<path")).toBeLessThan(g.indexOf("<image"));
  });
  it.each(["paused", "idle", "off", "unavailable"])("%s draws the glyph and no image", (s) => {
    const g = draw(at(s));
    expect(g).not.toContain("<image");
    expect(g).not.toMatch(/class="[^"]*\bart\b/);
  });
  it("mediaArt omitted or false draws no image: byte for byte as before", () => {
    const plain = renderFloor(f, { scale: 1, now: NOW, state: at("playing") as never });
    expect(renderFloor(f, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: false })).toBe(plain);
    expect(plain).not.toContain("<image");
  });
  it("a failed href draws the glyph; another href draws again (A6)", () => {
    expect(draw(at("playing"), { artFailed: new Set([OK]) })).not.toContain("<image");
    expect(draw(at("playing", { entity_picture_local: "/api/other.png" }), { artFailed: new Set([OK]) })).toContain(
      'href="/api/other.png"',
    );
  });
  it("media draws art too; a tv does not (A1)", () => {
    const g = structuredClone(f);
    g.devices[SPK] = { ...g.devices[SPK], type: "media" } as never;
    expect(group(renderFloor(g, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: true }))).toContain('<image class="art"');
    g.devices[SPK] = { ...g.devices[SPK], type: "tv" } as never;
    expect(group(renderFloor(g, { scale: 1, now: NOW, state: at("on") as never, mediaArt: true }))).not.toContain("<image");
  });
  it("a URL with & and ' reaches the attribute escaped, and a payload never does", () => {
    expect(draw(at("playing", { entity_picture_local: "/a?b=1&c='2'" }))).toContain(`href="/a?b=1&amp;c='2'"`);
    const bad = draw(at("playing", { entity_picture_local: '/"><script>alert(1)</script>' }));
    expect(bad).not.toContain("<script");
    expect(bad).not.toContain("<image");
  });
  it("liveOf hands the same icon to the 3D overlay", () => {
    const l = liveOf(f, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: true }, NOW);
    expect(l.devices[SPK]!.icon).toContain(`<image class="art" href="${OK.replace(/&/g, "&amp;")}"`);
    expect(l.devices[SPK]!.klass).toMatch(/\bart\b/);
  });
});
```

- [ ] **Step 2: Run it, see it fail**

Run: `npx vitest run tests/core/art.test.ts`
Expected: FAIL, `artUrl` and `MAX_ART_URL` are not exported from `schema.ts`.

- [ ] **Step 3: `artUrl`** — in `src/core/schema.ts`, after `TRACE_SRC` (line 162):

```ts
/** S29 (A2): the longest cover-art URL drawn. */
export const MAX_ART_URL = 2048;
/** S29 (A2): a cover-art href is a same-origin path and nothing else: Home Assistant's own media proxy (`entity_picture_local`)
 *  or a relative `entity_picture`. Music Assistant's LAN address fails over a remote connection and would be a request to
 *  another host; `//host/x` and `/\host/x` resolve to another origin. The value goes into an attribute, so the set of
 *  characters is closed; `renderFloor` still escapes it (finding 2). */
export const ART_SRC = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*$/;
const artOk = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_ART_URL && v[1] !== "/" && v[1] !== "\\" && ART_SRC.test(v);
/** The art of a media player's state attributes, or null. Untrusted state: anything else is null, never a throw. */
export function artUrl(attributes: unknown): string | null {
  if (typeof attributes !== "object" || attributes === null) return null;
  const a = attributes as Record<string, unknown>;
  return artOk(a.entity_picture_local) ? a.entity_picture_local : artOk(a.entity_picture) ? a.entity_picture : null;
}
```
(`schema.ts` is re-exported whole by `src/core/index.ts:1`.)

- [ ] **Step 4: The markup** in `src/core/render.ts`:
  - Import `artUrl` in the `./schema` import block (lines 6-15).
  - `RenderOpts`, after `plugHeat` (117):
  ```ts
  /** S29 (A3-A6): a playing speaker or media device shows its cover art (`artUrl`) in place of its glyph. Omitted or false: none, byte for byte as before. */
  mediaArt?: boolean;
  /** S29 (A6): art hrefs that failed to load; such a device draws its glyph. The card keeps the set (bounded). */
  artFailed?: ReadonlySet<string>;
  ```
  - `DeviceMarkup`: add `/** S29: the cover-art href drawn on the icon, or null. */ art: string | null;`.
  - `deviceMarkup` signature: `export function deviceMarkup(f: Floor, d: Device, o: RenderOpts, now: number, floorAt: Pt, quiet = false, index = -1): DeviceMarkup`.
  - In the body, before `const cls =`:
  ```ts
  // S29 (A1, A3, A5): a speaker or media device that is playing shows its art, read from its own state only; a failed href shows the glyph.
  // Needs the device's index for a clip id of its own (both callers pass it).
  const s0 = o.state?.[d.entity],
    href =
      o.mediaArt === true && index >= 0 && (d.type === "speaker" || d.type === "media") && s0?.state === "playing"
        ? artUrl(s0.attributes)
        : null,
    art = href && !o.artFailed?.has(href) ? href : null;
  ```
  - Append `(art ? " art" : "")` at the end of the `cls` expression.
  - Change the `icon` line to:
  ```ts
  // S29 (A3): the art after the glyph, clipped to the halo's own circle; the clip sits beside it in the same svg, named by attribute (the camera cone's way).
  const artMark = art
    ? `<clipPath id="fp-art-${index}"><circle cx="12" cy="12" r="16"/></clipPath><image class="art" href="${esc(art)}" x="-4" y="-4" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#fp-art-${index})"/>`
    : "";
  const icon = `${ping}${wave}${siren}<circle class="halo" cx="12" cy="12" r="16"/><path d="${DEVICE_ICONS[d.type] ?? DEVICE_ICONS.other}"/>${artMark}${mark}${gone}`;
  ```
  (This branch starts without S29.1. At the Group A merge the line becomes S29.1's `<circle class="halo${heat !== null ? " heat" : ""}" …/>` followed by S29.2's `${artMark}`.)
  - Return `{ cls, base, style, icon, s, art }`.
  - `renderFloor` call (2508): `deviceMarkup(f, d, o, now, floorAt, lit.has(i), i)`.
  - `src/core/live-build.ts:138`: `deviceMarkup(safe, d, o, now, at, false, i)`.

- [ ] **Step 5: Run it, see it pass**

Run: `npx vitest run tests/core/art.test.ts tests/core/render.test.ts tests/core/live.test.ts`, then `echo $?`. Expected 0, render snapshot unchanged.

- [ ] **Step 6: Write the failing CSS pairs (AC 10)** — `tests/card/art-css.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo } from "./helpers-3d";
import { FLOORPLAN_CSS, renderFloor } from "../../src/core/render";

// S29 (A4, AC 10): under .art the glyph is gone and the halo is a ring in the device colour; at far the art goes and the glyph is the
// far dot again. Read back from Chromium (finding 10). The markup is renderFloor's own; the href never loads (about:blank), which
// does not matter here: only the rules are read.
const OK = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=3f2a";
const floor = () => {
  const f = structuredClone(demo.floors.ground);
  f.devices.push({ id: "spk", type: "speaker", entity: "media_player.kitchen", name: "Kitchen speaker", x: 700, y: 300 });
  return f;
};
const SPK = 12;
const state = { "media_player.kitchen": { state: "playing", attributes: { entity_picture_local: OK }, last_changed: "2026-10-12T10:00:00Z" } };
const markup = (detail?: "far" | "mid" | "near") =>
  renderFloor(floor() as never, { scale: 1, state: state as never, now: Date.parse("2026-10-12T10:00:05Z"), mediaArt: true, detail });
const plan = (theme: string, body: string) => {
  const [t, mode] = theme === "ha-dark" ? ["ha", "dark"] : [theme, "light"];
  return `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg width="1000" height="800" viewBox="0 0 1000 800"><g data-theme="${t}" data-mode="${mode}" id="p">${body}</g></svg></body></html>`;
};
const read = (page: Page) =>
  page.evaluate((i) => {
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "#000";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const g = document.querySelector(`g[data-x="${i}"]`)!,
      path = getComputedStyle(g.querySelector("path")!),
      halo = getComputedStyle(g.querySelector(".halo")!),
      img = getComputedStyle(g.querySelector("image.art")!);
    return {
      cls: g.getAttribute("class"),
      glyph: path.display,
      art: img.display,
      fillOpacity: halo.fillOpacity,
      stroke: rgb(halo.stroke),
      strokeWidth: halo.strokeWidth,
      speaker: rgb(getComputedStyle(document.getElementById("p")!).getPropertyValue("--fp-dev-speaker").trim()),
    };
  }, SPK);

for (const theme of ["light", "blueprint", "ha-dark"]) {
  test(`${theme}: under .art the glyph is display:none and the halo is a ring with no fill (AC 10)`, async ({ page }) => {
    await page.setContent(plan(theme, markup()));
    const r = await read(page);
    expect(r.cls).toMatch(/\bart\b/);
    expect(r.glyph).toBe("none");
    expect(r.art).not.toBe("none");
    expect(r.fillOpacity).toBe("0");
    expect(r.stroke).toEqual(r.speaker);
    expect(r.strokeWidth).toBe("2px");
  });
  test(`${theme}: at far the art is hidden and the glyph and the filled disc are back; at mid the art shows (AC 10)`, async ({
    page,
  }) => {
    await page.setContent(plan(theme, markup("far")));
    const far = await read(page);
    expect(far.art).toBe("none");
    expect(far.glyph).not.toBe("none");
    expect(far.fillOpacity).toBe("1");
    await page.setContent(plan(theme, markup("mid")));
    const mid = await read(page);
    expect(mid.art).not.toBe("none");
    expect(mid.glyph).toBe("none");
  });
}
```

Run `PW_PORT=5275 npx playwright test tests/card/art-css.spec.ts`, `echo $?`: FAIL (glyph is `inline`).

- [ ] **Step 7: The rules.** In `FLOORPLAN_CSS`, after `.dev.on .halo{…}` (692):
  ```css
  /* S29 (A4): a playing speaker with cover art. The art (clipped to the halo's circle) replaces the glyph; the halo becomes a ring in the device colour; the waves stay. g.dev outranks .dev.on .halo. */
  g.dev.art path{display:none} g.dev.art .halo{fill-opacity:0;stroke:var(--fp-dev);stroke-width:2;vector-effect:non-scaling-stroke}
  ```
  and at the end of the S25.2 block (after line 775, inside the template literal):
  ```css
  /* S29 (A4): at far the art is a far dot like any other on device: no art, the glyph back, the disc filled. */
  [data-detail="far"] g.dev.art .art{display:none} [data-detail="far"] g.dev.art path{display:inline} [data-detail="far"] g.dev.art .halo{fill-opacity:1;stroke:none}
  ```
  Run the spec again: PASS. Then `--repeat-each=10`, `echo $?`, 0. Break once: drop `g.dev.art path{display:none}`, see the first test fail, restore.

- [ ] **Step 8: Card wiring, test first** — `tests/card/card-art-config.test.ts` (same header as `card-temp-config.test.ts`, S29.1 Step 9: the `vi.mock`, `lastOpts`, `mount`, `beforeEach`/`afterEach`), with:

```ts
describe("media_art (S29, S3)", () => {
  it("on by default", async () => {
    await mount();
    expect(lastOpts().mediaArt).toBe(true);
  });
  it("media_art: false is off; junk is on", async () => {
    const off = await mount({ media_art: false });
    expect(lastOpts().mediaArt).toBe(false);
    off.remove();
    for (const v of ["no", 0, null, "false"]) {
      const el = await mount({ media_art: v as never });
      expect(lastOpts().mediaArt, JSON.stringify(v)).toBe(true);
      el.remove();
    }
  });
});
```
Run `npx vitest run tests/card/card-art-config.test.ts`: FAIL. Then in `src/card/floorplan-studio-card.ts`:
  - Config interface, after `floors_below` (238): `/** S29: \`false\` shows a playing speaker's icon instead of its cover art; anything else shows the art (default). The View options' Cover art button changes it for one viewer. */ media_art?: boolean;`
  - After `_names()` (1651-1653):
  ```ts
  /** S29 (A3, S3): whether a playing speaker shows its cover art. Untrusted YAML: only a real `false` is off. */
  private _mediaArt(): boolean {
    return this._config.media_art !== false;
  }
  ```
  - `mediaArt: this._mediaArt(),` after `showNames` in both the `setLive` (2071) and `renderFloor` (4069) options.
Run again: PASS.

- [ ] **Step 9: Run everything scoped**

Run: `npx vitest run`, `echo $?` (0); `npm run typecheck`, `npm run lint`, `npm run format:check`, each with `echo $?` (0).
Run (scoped; `grep -lE "speaker|\"playing\"|\.wave|\.halo|plan-incremental" tests/card/*.spec.ts`):
`PW_PORT=5275 npx playwright test tests/card/art-css.spec.ts tests/card/device-states-css.spec.ts tests/card/detail-css.spec.ts tests/card/effect-size-css.spec.ts tests/card/card-device-solids.spec.ts tests/card/card-linked-piece.spec.ts tests/card/plan-incremental.spec.ts tests/card/card.spec.ts tests/card/size-budget.spec.ts`
Then `echo $?`. Expected 0. (The card harness serves `file://`; a playing speaker in a card test there would show the glyph after the image fails, which is S29.6's subject. Report any spec that changed and why.)

- [ ] **Step 10: Look.** `npm run shots`, `echo $?`. The shots carry no art URL yet (S29.6 adds one), so nothing changes; confirm `npm run shots -- --strict` is clean, `echo $?`.

- [ ] **Step 11: Records.**
  - `CHANGELOG.md`: `- A playing speaker or media player shows its cover art on the plan in place of its icon, with a ring in its colour; at the furthest zoom it is a dot again. Only Home Assistant's own image proxy or a relative picture is drawn; any other address is ignored. YAML \`media_art: false\` turns it off.`
  - `FORK.md`, new top entry `## 2026-10-12: Sprint 29, cover art markup (branch \`task/s29-2\`)`: `- \`artUrl\` in \`src/core/schema.ts\`; \`deviceMarkup\` draws \`image.art\` with a per-device clip; \`.art\` rules in \`FLOORPLAN_CSS\`; card key \`media_art\`.`
  - `docs/DECISIONS.md`, new top entry:
  ```markdown
  ## 2026-10-12: cover art follows the entity, and its far dot is a plain dot (Sprint 29)

  Art shows only while the media player's own state is `playing`; each grouped speaker is read on its own. Music Assistant can
  report a stale `idle` while playing (seen 2026-10-09); the card follows the entity and does not work around it. The clip id is
  `fp-art-<device index>`, so `deviceMarkup` takes the index (art is drawn only when it is given). At `far` the art, its ring
  and the hidden glyph are all undone, so the far dot is the same filled disc as any on device. Tests use a generic LAN
  address, never the maintainer's.
  ```

- [ ] **Step 12: Commit**

```bash
git add src/core/schema.ts src/core/render.ts src/core/live-build.ts src/card/floorplan-studio-card.ts tests/core/art.test.ts tests/card/art-css.spec.ts tests/card/card-art-config.test.ts CHANGELOG.md FORK.md docs/DECISIONS.md
git commit -m "Draw a playing speaker's cover art in place of its icon"
```

---

## Task S29.3 (Group A): Layers in live 3D

Branch `task/s29-3`, `PW_PORT=5276`. Parallel with S29.1 and S29.2.

**Files:**
- Modify: `src/core/live-build.ts`: `LiveDeps` (14-33), the destructure in `makeLiveOf` (88-106), the device loop (127-176)
- Modify: `src/core/three-deps.ts` (import `layerHides` from `./layers`; add it to `liveDeps`)
- Modify: `src/card/three/pick.ts`: `Picker.pick` (186-215)
- Modify: `src/card/three/view3d.ts`: state (281-283), reset (841-842), `buildMarkers` (861-885), `applyBodies` (1133-1144), `applyBalls` (1146-1161), `applyLive` (1218: `here`), `pick` (1493-1505), test hook `live()` (1786-1816)
- Modify: `src/card/floorplan-studio-card.ts`: `setLive` options (2054-2072); `_layersToggle` (3910-3922); `_layerChips` (3924-3937)
- Modify: `tests/core/live.test.ts`, `tests/card/three-pick.test.ts`
- Create: `tests/card/card-3d-layers.spec.ts`
- Modify: `docs/card.md` (the `#tabLayers` row, line 278: "Not in 3D" goes)
- Records: `CHANGELOG.md`, `FORK.md`, `docs/DECISIONS.md`

**Interfaces:**
- Consumes: `RenderOpts.hiddenLayers`, `RenderOpts.keep`, `RenderOpts.selection` (existing).
- Produces:
  ```ts
  // src/core/live-build.ts
  LiveDeps adds Pick<typeof import("./layers"), "layerHides">;
  // liveOf: devices[i] === null when layerHides(o.hiddenLayers, "dev", i, d.type, o.selection, o.keep);
  //         a hidden lit light stays in `lights` (its room lift stays); pieces are never hidden.
  // src/card/three/pick.ts
  pick(ray: Ray, zOf: (s: Solid) => [number, number] | null, skip?: (s: Solid) => boolean): Pick | null;
  // test hook live(): balls[k].shown is real; bodies[k].visible added
  // card: setLive options gain hiddenLayers: this._hiddenLayers, keep: this._keptHere()
  ```

- [ ] **Step 1: Write the failing core tests** — append to `tests/core/live.test.ts`:

```ts
describe("liveOf: Layers (S29, L1-L3)", () => {
  const on = { "light.demo_living": st("on"), "light.demo_kitchen": st("on") };
  it("a hidden family is a null slot; its lit lamps still lift their rooms", () => {
    const l = live(on, ground, { hiddenLayers: ["lights"] });
    expect(l.devices[0]).toBeNull();
    expect(l.devices[1]).toBeNull();
    expect(l.devices[4]).not.toBeNull(); // the living temperature sensor: another family
    expect(l.lights.map((x) => x.device)).toEqual([0, 1]);
  });
  it("keep draws one thing of a hidden family (a device found by search)", () => {
    const l = live(on, ground, { hiddenLayers: ["lights"], keep: { t: "dev", i: 1 } });
    expect(l.devices[0]).toBeNull();
    expect(l.devices[1]).not.toBeNull();
  });
  it("furniture is not hidden in 3D", () => {
    const f = structuredClone(ground);
    f.furniture.push({ id: "tv", symbol: "tv", x: 100, y: 100, rot: 0, w: 120, h: 10, entity: "media_player.tv" } as never);
    const s = { "media_player.tv": st("on") };
    expect(live(s, f, { hiddenLayers: ["furniture"] }).pieces).toEqual(live(s, f).pieces);
  });
  it("no family hidden is byte for byte as before", () => {
    expect(JSON.stringify(live(on, ground, { hiddenLayers: [] }))).toBe(JSON.stringify(live(on)));
  });
  it("junk hiddenLayers and keep never throw", () => {
    for (const h of [null, 5, "lights", [{}], ["__proto__"]])
      expect(() => live(on, ground, { hiddenLayers: h as never, keep: { t: 5, i: "x" } as never })).not.toThrow();
  });
});
```

And to `tests/card/three-pick.test.ts`:

```ts
describe("Picker: a device the view hides is not hit (S29, Review focus 1)", () => {
  const p = new Picker(
    buildScene(house({ devices: [{ id: "l", type: "light", entity: "light.a", x: 150, y: 250 }] as never })).solids,
  );
  it("its proxy is hit when nothing is skipped", () => {
    expect(p.pick(down(150, 250), plain)).toEqual({ type: "device", index: 0 });
  });
  it("skipped, the ray reaches the room under it", () => {
    expect(p.pick(down(150, 250), plain, (s) => s.kind === "device" && s.ref.index === 0)).toEqual({
      type: "room",
      index: 0,
    });
  });
});
```

- [ ] **Step 2: Run them, see them fail**

Run: `npx vitest run tests/core/live.test.ts tests/card/three-pick.test.ts`
Expected: FAIL: `devices[0]` is an object, not null; the skipped pick still returns the device (the third argument is ignored).

- [ ] **Step 3: Implement core.**
  - `LiveDeps` (live-build.ts:14-33): add `& Pick<typeof import("./layers"), "layerHides">`. Destructure `layerHides` in `makeLiveOf`.
  - In the device loop, at the end of the `try` (after the `lights.push` block, before `} catch`):
  ```ts
  // S29 (L1, L2): a family Layers hides draws nothing in 3D either: the slot is null, as for a room's own sensor. A lit lamp
  // stays in `lights`, so its room is still lifted (the 2D room glow stays too); the view drops its pool and wall glow.
  if (layerHides(o.hiddenLayers, "dev", i, d.type, o.selection, o.keep)) out[i] = null;
  ```
  - `src/core/three-deps.ts`: `import { layerHides } from "./layers";` and add `layerHides` to the `liveDeps` object.
  - `src/card/three/pick.ts`, `pick`: new signature `pick(ray: Ray, zOf: (s: Solid) => [number, number] | null, skip: (s: Solid) => boolean = () => false): Pick | null`; first line of the `for` body: `if (skip(it.s)) continue; // S29: a device Layers hides is not there to tap`. Update its doc comment to name `skip`.

Run Step 2 again: PASS.

- [ ] **Step 4: Write the failing Playwright spec** — `tests/card/card-3d-layers.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";
import { openOverview, viewControl } from "./shell-helpers";

// S29 (L1-L4, AC 1-4, Review focus 1): the layer chips in live 3D. Demo ground floor: devices 0 and 1 are the living and kitchen
// lights, 7 the living radiator (a body in 3D), 4 the living temperature sensor. Real page.mouse clicks on the real top element
// (finding 3); the scene is read through the test hook (dist-test/), the overlay from its DOM.
const st = (state: string, attributes: Record<string, unknown> = {}) => ({
  state,
  attributes,
  last_changed: new Date().toISOString(),
});
const STATES = {
  "light.demo_living": st("on", { friendly_name: "Living light" }),
  "light.demo_kitchen": st("on"),
  "climate.demo_living": st("heat", { hvac_action: "heating" }),
};
interface Live {
  balls: { index: number; shown: boolean }[];
  bodies: { index: number; type: string; visible: boolean }[];
  pools: { visible: boolean }[];
  lifted: number[];
}
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fp3d: { live(): unknown } }).__fp3d.live()) as Promise<Live>;
const LIGHTS = [0, 1];

async function boot(page: Page, view: "2d" | "3d" = "3d") {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, states]) => {
      try {
        localStorage.clear();
      } catch {
        /* no storage */
      }
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = { states, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: structuredClone(demo), floor: "ground", view, theme: "light" }, STATES] as const,
  );
  if (view === "3d") await drawn(page);
  await openOverview(page);
}
/** Device indices with an overlay icon whose group is a `type`. */
const icons = (page: Page, type: string) =>
  holder(page).evaluate(
    (root, type) =>
      [...root.querySelectorAll<SVGSVGElement>("svg.fp3-ic")]
        .filter((s) => s.querySelector(`g.dev-${type}`))
        .map((s) => +s.getAttribute("data-i")!)
        .sort((a, b) => a - b),
    type,
  );
async function clickOn(page: Page, sel: string) {
  const p = await card(page).evaluate((el, sel) => {
    const t = el.shadowRoot!.querySelector(sel);
    if (!t) return null;
    t.scrollIntoView({ block: "center" });
    const r = t.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2,
      top = el.shadowRoot!.elementFromPoint(x, y);
    return top && (top === t || t.contains(top)) ? { x, y } : null;
  }, sel);
  expect(p, `${sel} is the top element at its centre`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}
const toggle = (page: Page) => card(page).locator("css=.fp-ov-scopes button.fp-layers-toggle");
const chip = (page: Page, id: string) => card(page).locator(`css=.fp-ov-layers button.fp-layer[data-layer="${id}"]`);
async function hide(page: Page, id: string) {
  if ((await toggle(page).getAttribute("aria-expanded")) !== "true") await clickOn(page, ".fp-ov-scopes button.fp-layers-toggle");
  await clickOn(page, `.fp-ov-layers button.fp-layer[data-layer="${id}"]`);
}
const shownBalls = (l: Live, of: number[]) => l.balls.filter((b) => of.includes(b.index) && b.shown).map((b) => b.index).sort();

test("AC 1: in live 3D the Lights chip takes away light icons, balls and pools; the room lift stays; a second click brings them back", async ({
  page,
}) => {
  await boot(page);
  await expect(toggle(page)).toBeVisible(); // L4: the Layers button is there in 3D
  await expect.poll(() => icons(page, "light")).toEqual(LIGHTS);
  await expect.poll(async () => (await live(page)).pools.filter((p) => p.visible).length).toBe(2);
  const before = await live(page);
  expect(shownBalls(before, LIGHTS)).toEqual(LIGHTS);
  await hide(page, "lights");
  await expect(toggle(page)).toHaveText("Layers · 1 hidden");
  await expect.poll(() => icons(page, "light")).toEqual([]);
  const hid = await live(page);
  expect(shownBalls(hid, LIGHTS)).toEqual([]);
  expect(hid.pools.filter((p) => p.visible)).toEqual([]);
  expect(hid.lifted).toEqual(before.lifted);
  await clickOn(page, '.fp-ov-layers button.fp-layer[data-layer="lights"]');
  await expect.poll(() => icons(page, "light")).toEqual(LIGHTS);
  await expect.poll(async () => shownBalls(await live(page), LIGHTS)).toEqual(LIGHTS);
  await expect.poll(async () => (await live(page)).pools.filter((p) => p.visible).length).toBe(2);
});

test("L2: a hidden family's body goes too (the radiator, Climate)", async ({ page }) => {
  await boot(page);
  await expect.poll(async () => (await live(page)).bodies.find((b) => b.index === 7)?.visible).toBe(true);
  await hide(page, "climate");
  await expect.poll(async () => (await live(page)).bodies.find((b) => b.index === 7)?.visible).toBe(false);
});

test("AC 2: a light found by search stays on the overlay with Lights hidden", async ({ page }) => {
  await boot(page);
  await hide(page, "lights");
  await expect.poll(() => icons(page, "light")).toEqual([]);
  await page.keyboard.press("/");
  await page.keyboard.type("Living light");
  await page.keyboard.press("Enter");
  await expect.poll(() => icons(page, "light")).toEqual([0]);
  await expect(card(page).locator("css=.fp-layer-note")).toContainText("Hidden by Layers: lights");
});

test("AC 3: the Furniture chip is disabled in 3D, enabled in 2D, and its stored state is kept", async ({ page }) => {
  await boot(page, "2d");
  await hide(page, "furniture");
  const stored = () =>
    page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith("fp-view:"))
        .map(([, v]) => JSON.parse(v).layers),
    );
  expect(await stored()).toEqual([["furniture"]]);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect(chip(page, "furniture")).toBeDisabled();
  await expect(chip(page, "furniture")).toHaveAttribute("title", "Furniture hides in 2D only");
  await expect(chip(page, "furniture")).toHaveAttribute("aria-pressed", "false");
  expect(await stored()).toEqual([["furniture"]]);
  await viewControl(page).selectOption("2d");
  await expect(chip(page, "furniture")).toBeEnabled();
  expect(await card(page).evaluate((el) => el.shadowRoot!.querySelectorAll("svg g[data-f]").length)).toBe(0);
});

test("AC 4: Lights hidden in 3D stay hidden in 2D, and in 3D again", async ({ page }) => {
  await boot(page);
  await hide(page, "lights");
  await viewControl(page).selectOption("2d");
  await expect
    .poll(() => card(page).evaluate((el) => el.shadowRoot!.querySelectorAll("svg g.dev-light").length))
    .toBe(0);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect.poll(() => icons(page, "light")).toEqual([]);
});

test("Review focus 1: a tap where a hidden light hangs picks its room, not the light", async ({ page }) => {
  await boot(page);
  await hide(page, "lights");
  await card(page).locator("css=button.fp-active-collapse").click(); // fold the Overview off the canvas
  await page.waitForTimeout(400); // clear of the double-tap window (DECISIONS 2026-10-11)
  const p = await page.evaluate(() =>
    (window as unknown as { __fp3d: { where(k: string, i: number): { x: number; y: number } | null } }).__fp3d.where("device", 0),
  );
  const got = await page.evaluate(
    (p) => (window as unknown as { __fp3d: { pick(x: number, y: number): unknown } }).__fp3d.pick(p!.x, p!.y),
    p,
  );
  expect(got).toEqual({ type: "room", index: 0 });
  await page.mouse.click(p!.x, p!.y);
  await expect.poll(() => holder(page).getAttribute("data-ring"), { timeout: 3000 }).toBe("0");
  await expect(card(page).locator("css=.fp-pop")).toHaveCount(0);
});
```
Run: `PW_PORT=5276 npx playwright test tests/card/card-3d-layers.spec.ts`, `echo $?`. Expected: FAIL (no Layers button in 3D: `toBeVisible` fails).

- [ ] **Step 5: Implement the view.** In `src/card/three/view3d.ts`:
  - State (281-283): `let ballIdx: number[] = [], ballRest: Color[] = [], ballAt: [number, number, number][] = [], ballShown: boolean[] = [], anchors: …`. Reset both new arrays where `ballIdx = []` is (841-842).
  - `buildMarkers`, inside `pts.forEach`: after `ballIdx.push(...)` add `ballAt.push([sol.shape.at[0], sol.shape.z, sol.shape.at[1]]); ballShown.push(true);`.
  - `applyBalls` (1146-1161), replace with:
  ```ts
  /** A ball is the colour its icon is drawn in (the card's stylesheet decides, as in 2D), faded toward the backdrop by the icon's
   *  opacity. S29 (L2): a device Layers hides (a null slot) has no ball: it is scaled to nothing, and comes back with its family. */
  function applyBalls() {
    if (!markers) return;
    const L = liveNow ?? EMPTY,
      back = paintOf("backdrop", undefined).colour,
      c = new Color(),
      m4 = new Matrix4();
    let moved = false;
    ballIdx.forEach((di, k) => {
      const show = L.devices[di] !== null;
      if (show !== ballShown[k]) {
        ballShown[k] = show;
        const p = ballAt[k]!;
        markers!.setMatrixAt(k, show ? m4.makeTranslation(p[0], p[1], p[2]) : m4.makeScale(0, 0, 0));
        moved = true;
      }
      const f = overlay.fill(di),
        css = f ? resolveColour(probe, f.css) : null;
      if (css === null || !f) {
        markers!.setColorAt(k, ballRest[k]);
        return;
      }
      c.set(`#${hex(css)}`);
      if (f.opacity < 1) c.lerp(back, 1 - Math.max(0, f.opacity));
      markers!.setColorAt(k, c);
    });
    if (moved) markers.instanceMatrix.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  }
  ```
  (`L.devices[di]` is `undefined` before any live state: shown.)
  - `applyBodies` loop body, first lines: `const d = L.devices[b.index] ?? null, show = L.devices[b.index] !== null; b.mesh.visible = show; for (const m of b.lit) m.visible = show;` (keep the colour lines).
  - `applyLive` (1218): `const here = lit.filter((l) => roomSolid.has(l.room) && L.devices[l.device] !== null); // S29 (L2): a hidden lamp lifts its room (above) but casts no pool or wall glow`.
  - `pick` (1504): pass a third argument
  ```ts
  (sol) => sol.kind === "device" && typeof sol.ref.index === "number" && !!liveNow && liveNow.devices[sol.ref.index] === null,
  ```
  - Test hook `live()`: `balls: ballIdx.map((di, k) => { markers?.getColorAt(k, c); return { index: di, colour: hexOf(c), shown: ballShown[k] ?? true }; })`, and in `body(b)` add `visible: b.mesh.visible`.

- [ ] **Step 6: Implement the card.** In `src/card/floorplan-studio-card.ts`:
  - `setLive` options (after `around`, 2071): `hiddenLayers: this._hiddenLayers, keep: this._keptHere(), // S29 (L1, L3): the families Layers hides, and a found thing kept anyway`.
  - `_layersToggle` (3913-3914): `if (!this._floor()) return nothing;` and change "Not in live 3D." in its comment to "Also in live 3D (S29), where Furniture stays drawn."
  - `_layerChips` (3925-3937):
  ```ts
  private _layerChips() {
    const f = this._floor();
    if (!f) return nothing;
    // S29 (L4): in live 3D furniture is solids in the canvas and is not hidden; its chip is disabled there and its stored state kept.
    const in3d = this._shows3d();
    const n = layerCounts(f),
      hidden = this._hiddenLayers,
      k = this._keptHere();
    const word = (id: LayerId) => (LAYERS.find((l) => l.id === id)?.label ?? id).toLowerCase();
    const chips = LAYERS.filter((l) => n[l.id] > 0).map((l) => {
      const shown = !hidden.includes(l.id),
        off = in3d && l.id === "furniture";
      return html`<button type="button" class="fp-layer" data-layer=${l.id} aria-pressed=${shown ? "true" : "false"} ?disabled=${off} title=${off ? "Furniture hides in 2D only" : `${shown ? "Hide" : "Show"} ${word(l.id)} (${n[l.id]}). Alt-click: ${word(l.id)} only`} @click=${(e: MouseEvent) => this._setLayers(e.altKey ? soloLayer(hidden, l.id) : toggleLayer(hidden, l.id))}>${l.label}</button>`;
    });
    const note = k && !(in3d && k.fam === "furniture");
    return html`${this._layersOpen ? html`<div class="fp-layer-chips">${chips}</div>` : nothing}${note ? html`<p class="fp-layer-note" role="status">Hidden by Layers: ${word(k.fam)} <button type="button" @click=${() => this._setLayers(hidden.filter((x) => x !== k.fam))}>Show</button></p>` : nothing}`;
  }
  ```
  Update its doc comment: "Not in live 3D, which draws every family" becomes "In live 3D too (S29); there the Furniture chip is disabled."

- [ ] **Step 7: Run it, see it pass; repeat it**

Run: `PW_PORT=5276 npx playwright test tests/card/card-3d-layers.spec.ts`, `echo $?` (0); then with `--repeat-each=10`, `echo $?` (0).

- [ ] **Step 8: Scoped suites**

Run: `npx vitest run`, `echo $?` (0); `npm run typecheck`, `npm run lint`, `npm run format:check`, each `echo $?` (0).
Run (scoped; `grep -lE "fp-layer|layers-toggle|live\(\)|balls|pools|bodies|__fp3d.pick|fp-search" tests/card/*.spec.ts`):
`PW_PORT=5276 npx playwright test tests/card/card-3d-layers.spec.ts tests/card/card-layers.spec.ts tests/card/detail-menu.spec.ts tests/card/view-parity.spec.ts tests/card/card-3d-live.spec.ts tests/card/card-3d-pick.spec.ts tests/card/card-3d-popup.spec.ts tests/card/card-3d-perf.spec.ts tests/card/card-3d-colors.spec.ts tests/card/card-3d-tex-glow.spec.ts tests/card/card-find.spec.ts tests/card/size-budget.spec.ts`
Then `echo $?`. Expected 0. A spec that asserted "no chips in 3D" is now wrong by design: change it to the new rule in this commit and say so.

- [ ] **Step 9: Break it once.** Revert only `src/card/three/view3d.ts` (path-scoped stash): AC 1's ball and pool assertions fail. Restore.

- [ ] **Step 10: Records.**
  - `docs/card.md` line 278: in the `#tabLayers` row replace "Not in 3D" with "In 3D too, where Furniture is not hidden (its chip is disabled)".
  - `CHANGELOG.md`: `- Layers work in 3D: hiding a family takes its icons, balls, bodies and lamp pools off the 3D view, and a tap there finds the room instead. The room's light lift stays. Furniture is not hidden in 3D; its chip is disabled there.`
  - `FORK.md`, new top entry `## 2026-10-12: Sprint 29, Layers in 3D (branch \`task/s29-3\`)`: `- \`liveOf\` applies \`layerHides\`; \`view3d.ts\` hides balls, bodies, pools and glow for null slots and skips them in \`Picker.pick\`; the card shows the chips in 3D.`
  - `docs/DECISIONS.md`, new top entry:
  ```markdown
  ## 2026-10-12: Layers in 3D: hidden devices are not tappable; a ball is scaled to nothing (Sprint 29)

  A device whose family is hidden is a null slot in the live state (as a room's own sensor is). The view then drops its overlay
  icon, ball, body and lamp pool and wall glow; a lit lamp still lifts its room. The spec did not say what a tap at its spot
  does: the picker's proxy ball and the body would still have opened its popup, unlike 2D, so `Picker.pick` skips such
  devices and the tap reads the room. Balls are one instanced mesh, so a hidden one is scaled to nothing. Baked contact shadows
  under a hidden body stay (they are built with the scene). A device that cannot be read is a null slot too and now loses its
  ball; that is junk input.
  ```

- [ ] **Step 11: Commit**

```bash
git add src/core/live-build.ts src/core/three-deps.ts src/card/three/pick.ts src/card/three/view3d.ts src/card/floorplan-studio-card.ts tests/core/live.test.ts tests/card/three-pick.test.ts tests/card/card-3d-layers.spec.ts docs/card.md CHANGELOG.md FORK.md docs/DECISIONS.md
git commit -m "Apply Layers in live 3D"
```

---

### Merge Group A

Coordinator: create `task/s29-integrate` off `task/s29-spec`; `git merge --no-ff task/s29-1`, then `task/s29-2`, then `task/s29-3`. Expected conflicts, all "keep both": the `RenderOpts` interface (S29.1 `tempColors`, S29.2 `mediaArt`/`artFailed`), the `deviceMarkup` icon line (keep S29.1's halo class expression with S29.2's `${artMark}`), the `setLive` and `renderFloor` option literals in the card (one new line each from each task), `CHANGELOG.md`/`FORK.md`/`docs/DECISIONS.md` tops. After the merge: `npx vitest run`, `npm run typecheck`, `npm run lint`, each with `echo $?`, and the union of the three tasks' scoped Playwright lists. Group B branches off this merge.

---

## Task S29.4 (Group B, after S29.1): the 2D pill and the temp icon ring

Branch `task/s29-4` off `task/s29-integrate`, `PW_PORT=5274`. Parallel with S29.5-S29.7.

**Files:**
- Modify: `src/core/render.ts`: the S11.1 readout block (2451-2471); `FLOORPLAN_CSS` (beside `.lbl-tag`, line 746)
- Create: `tests/card/temp-pill-2d.spec.ts`
- Modify: `tests/core/temp-colour.test.ts` (add the markup cases)
- Records: `CHANGELOG.md`, `FORK.md`

**Interfaces:**
- Consumes: `roomReadoutParts`, `RenderOpts.tempColors`, the `.val-pill,.halo.heat{--fp-temp:…}` rule, `deviceMarkup`'s `halo heat` (S29.1).
- Produces: markup `<rect class="val-pill" data-rp="<room>" … rx="<h/2>" style="--fp-temp-t:<t>"/>` drawn just before `<text class="val" data-rv="<room>" …><tspan class="val-t"><temp></tspan><" · rest" or nothing></text>`; CSS `.val-pill{fill:var(--fp-temp);fill-opacity:.35;stroke:none;pointer-events:none}` and `g.dev .halo.heat{stroke:var(--fp-temp);stroke-width:2;vector-effect:non-scaling-stroke}`.

- [ ] **Step 1: Write the failing markup units** — append to `tests/core/temp-colour.test.ts`:

```ts
describe("the 2D readout pill (H4)", () => {
  const f = structuredClone(ground);
  Object.assign(f.rooms[0], { temps: ["s.t"], humidity: ["s.h"] });
  Object.assign(f.rooms[6], { humidity: ["s.p"] }); // Garden pond: humidity only
  const s = { "s.t": st("16", "°C"), "s.h": st("48", "%"), "s.p": st("80", "%") };
  it("a room with a temperature draws a pill and its text in a tspan, the text unchanged", () => {
    const svg = renderFloor(f, { scale: 1, state: s as never, tempColors: [16, 26] });
    expect(svg).toMatch(/<rect class="val-pill" data-rp="0"[^>]* style="--fp-temp-t:0"\/><text class="val" data-rv="0"/);
    expect(svg).toContain('<tspan class="val-t">16 °C</tspan> · 48 %</text>');
    expect(svg).not.toContain('data-rp="6"');
  });
  it("no tempColors, or no temperature anywhere, is byte for byte as before", () => {
    expect(renderFloor(f, { scale: 1, state: s as never })).not.toContain("val-pill");
    const g = structuredClone(f);
    g.rooms[0].temps = [];
    g.devices = g.devices.filter((d) => d.type !== "temp");
    expect(renderFloor(g, { scale: 1, state: s as never, tempColors: [16, 26] })).toBe(renderFloor(g, { scale: 1, state: s as never }));
  });
  it("labels off draws no pill", () => {
    expect(renderFloor(f, { scale: 1, state: s as never, tempColors: [16, 26], labels: false })).not.toContain("val-pill");
  });
});
```
Run `npx vitest run tests/core/temp-colour.test.ts`: FAIL (no `val-pill`).

- [ ] **Step 2: Implement the markup.** Replace the readout block (2451-2471) with:

```ts
  // S11.1: the readout of a room's own sensors, a small line under its name (or at its anchor when it has none). Placed like
  // every other text, so it moves off a name or an icon; nothing readable draws nothing, never "NaN". S29 (H4): with
  // `tempColors`, the temperature is its own tspan on a pill (`--fp-temp-t`), sized by the tag's width estimate; the text is
  // character for character as before, and a room with no temperature draws exactly today's markup.
  f.rooms.forEach((r, i) => {
    if (!showText || !ROOM_OWNS[r.kind]) return;
    const { temp, rest, heat } = roomReadoutParts(r, o.state, o.tempColors);
    const text = [temp, rest].filter(Boolean).join(" · ");
    if (!text) return;
    const lab = nameAt[i],
      base = lab?.at ?? centroid(r.pts),
      size = lab?.size ?? 0,
      vs = 12 * kt;
    if (!base.every(Number.isFinite)) return;
    const [vx, vy] = place(
      [screenOff(base, 0, 0.25 * size + kt + 0.75 * vs), screenOff(base, 0, -0.75 * size - kt - 0.25 * vs)],
      vs,
      text,
    );
    const head = `<text class="val" data-rv="${i}" x="${num(vx)}" y="${num(vy)}"${up(vx, vy)} text-anchor="middle" font-size="${num(vs)}">`;
    if (heat === null || !temp) return void out.push(`${head}${esc(text)}</text>`);
    const h = vs + 2 * kt;
    out.push(
      `<rect class="val-pill" data-rp="${i}"${up(vx, vy)} x="${num(vx - (len(text) * 0.6 * vs) / 2 - 2 * kt)}" y="${num(vy - 0.75 * vs - kt)}" width="${num(len(temp) * 0.6 * vs + 4 * kt)}" height="${num(h)}" rx="${num(h / 2)}" style="--fp-temp-t:${num(heat)}"/>`,
      `${head}<tspan class="val-t">${esc(temp)}</tspan>${rest ? esc(` · ${rest}`) : ""}</text>`,
    );
  });
```
(`len` and `up` are in scope from the room-name loop, 2418-2419; `roomReadoutParts` is in this module.)

Run the unit again: PASS. Run `npx vitest run tests/core/render.test.ts tests/core/label-room.test.ts tests/core/detail-render.test.ts`, `echo $?`: 0, snapshot unchanged.

- [ ] **Step 3: Write the failing computed-style spec (AC 13, AC 14)** — `tests/card/temp-pill-2d.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo } from "./helpers-3d";
import { FLOORPLAN_CSS, renderFloor } from "../../src/core/render";

// S29 (H3-H5, AC 13, AC 14): the 2D pill and the temp icon's ring, read back from Chromium (finding 10). Expected colours are
// computed here from the theme's own tokens, in sRGB, the way color-mix(in srgb) mixes. Rooms: Living 16 °C (and 48 %), Kitchen
// 21, Hall 26, Garden 18.5 (t .25: a real mix, finding 4), Garden pond humidity only. Bounds 16 and 26.
const st = (state: string, unit: string) => ({ state, attributes: { unit_of_measurement: unit }, last_changed: "2026-10-12T10:00:00Z" });
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
const want = (t: number, c: number[], m: number[], h: number[]) => (t <= 0.5 ? mix(c, m, 1 - 2 * t) : mix(m, h, 2 - 2 * t));
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
  test(`${theme}: a temp icon at 16 and 26 °C wears a ring in the cold and the hot colour (AC 14)`, async ({ page }) => {
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
});
```

Run: `PW_PORT=5274 npx playwright test tests/card/temp-pill-2d.spec.ts`, `echo $?`. Expected: FAIL (opacity is `1`, ring stroke is `none`).

- [ ] **Step 4: The rules.** In `FLOORPLAN_CSS`, after the `.lbl-tag` rule on line 746:
  ```css
  /* S29 (H3-H5): the temperature pill sits behind the readout at a fixed share over the plan; the text keeps its own colour. A temp icon's
     ring is its stroke only (its disc is untouched); g.dev outranks .dev.on .halo. Never a click target (finding 18: a class rule). */
  .val-pill{fill:var(--fp-temp);fill-opacity:.35;stroke:none;pointer-events:none} g.dev .halo.heat{stroke:var(--fp-temp);stroke-width:2;vector-effect:non-scaling-stroke}
  ```
  Run the spec: PASS. `--repeat-each=10`, `echo $?`, 0. Break once: drop `fill-opacity:.35`, see AC 13 fail; restore.

- [ ] **Step 5: Look (finding 16).** `npm run shots`, `echo $?`. The `roomsensors` shots (Living at 21.7 °C on the default 17..25 scale) now show a pill. Open the 2D roomsensors shots in blueprint, light and HA dark at 4x on the Living readout and look: the pill sits behind the temperature only, the text reads on it, the name above is untouched. If the 35 % or a token reads badly on a theme, tune the token (S29.1's hex values) here and say what changed. Then `npm run shots -- --accept` only after looking.

- [ ] **Step 6: Scoped suites**

Run: `npx vitest run`, `echo $?`; `npm run typecheck`, `npm run lint`, `npm run format:check`, each `echo $?`. All 0.
Run (scoped; `grep -lE "data-rv|text\.val|readout|\.halo|dev-temp" tests/card/*.spec.ts tests/editor/*.spec.ts`):
`PW_PORT=5274 npx playwright test tests/card/temp-pill-2d.spec.ts tests/card/detail-css.spec.ts tests/card/labels-css.spec.ts tests/card/card-review-fixes.spec.ts tests/card/ui-system-css.spec.ts tests/card/device-states-css.spec.ts tests/card/card.spec.ts tests/card/label-tag-tap.spec.ts tests/editor/view-labels.spec.ts tests/editor/editor.spec.ts`
Then `echo $?`. Expected 0.

- [ ] **Step 7: Records.** `CHANGELOG.md`: `- A room's temperature on the plan sits on a pill coloured by a fixed comfort scale: blue at \`heat_min\` (17 °C), neutral half way, red at \`heat_max\` (25 °C); a temperature icon gets a ring in the same colour. The text is unchanged. \`temp_colors: false\` turns it off.` `FORK.md`, new top entry `## 2026-10-12: Sprint 29, temperature pill in 2D (branch \`task/s29-4\`)`: `- \`renderFloor\` draws \`rect.val-pill\` and \`tspan.val-t\` for a room's temperature; \`.val-pill\` and \`.halo.heat\` rules.`

- [ ] **Step 8: Commit**

```bash
git add src/core/render.ts tests/core/temp-colour.test.ts tests/card/temp-pill-2d.spec.ts CHANGELOG.md FORK.md
git commit -m "Put a room's temperature on a coloured pill in 2D"
```
(If Step 5 tuned a token, add `src/core/theme-roles.ts` and the token change to this commit and name it in the body.)

---

## Task S29.5 (Group B, after S29.1): the 3D pill and the temp icon ring

Branch `task/s29-5` off `task/s29-integrate`, `PW_PORT=5275`.

**Files:**
- Modify: `src/core/live-build.ts`: `LiveRoom` (65-70), `LiveDeps` (add `roomReadoutParts`), the rooms map (205-221)
- Modify: `src/core/three-deps.ts` (import and hand over `roomReadoutParts`)
- Modify: `src/card/three/overlay.ts`: `CSS` (63-79), room `set` (304-330)
- Modify: `tests/core/live.test.ts`
- Create: `tests/card/three-overlay-pill.test.ts`, `tests/card/card-3d-temp.spec.ts`
- Records: `CHANGELOG.md`, `FORK.md`

**Interfaces:**
- Consumes: `roomReadoutParts`, `RenderOpts.tempColors` (already passed to `setLive` by S29.1), `deviceMarkup`'s `--fp-temp-t` and `halo heat` (in `LiveDevice.style`/`icon`), the `--fp-temp` rule.
- Produces:
  ```ts
  export interface LiveRoom {
    name: string; at: Pt; readout: string;
    /** S29 (H6): the temperature text, the rest (humidity), and the scale's t (0..1, 0.01 steps) or null. */
    temp: string; rest: string; heat: number | null;
    motion: …;
  }
  // overlay: .fp3-val holds <span class="val-pill" style="--fp-temp-t:t">temp</span> + " · rest"; its signature includes heat
  ```

- [ ] **Step 1: Failing core test** — append to `tests/core/live.test.ts`:

```ts
describe("liveOf: a room's temperature for the 3D pill (S29, H6)", () => {
  const f = structuredClone(ground);
  Object.assign(f.rooms[0], { temps: ["s.t"], humidity: ["s.h"] });
  const s = { "s.t": st("18.5", { unit_of_measurement: "°C" }), "s.h": st("48", { unit_of_measurement: "%" }) };
  it("carries the temperature, the rest and the heat; the readout is unchanged", () => {
    expect(live(s, f, { tempColors: [16, 26] }).rooms[0]).toMatchObject({
      temp: "18.5 °C",
      rest: "48 %",
      heat: 0.25,
      readout: "18.5 °C · 48 %",
    });
  });
  it("no tempColors is no heat", () => {
    expect(live(s, f).rooms[0]!.heat).toBeNull();
  });
});
```
Run `npx vitest run tests/core/live.test.ts`: FAIL (`temp` undefined).

- [ ] **Step 2: Implement core.** `LiveRoom`: add the three fields above. `LiveDeps`: add `| "roomReadoutParts"` to the `Pick<Render, …>` list; destructure it; in `three-deps.ts` import `roomReadoutParts` from `./render` and add it to `liveDeps`. In the rooms map (205-221), after `owns = ROOM_OWNS[r.kind];` add
  ```ts
  // S29 (H6): the parts by the plan's own function, so the 3D pill and the 2D one cannot differ.
  const parts = owns ? roomReadoutParts(r, o.state, o.tempColors) : null;
  ```
  and after the `readout:` line of the returned object add
  ```ts
  temp: parts?.temp ?? "",
  rest: parts?.rest ?? "",
  heat: parts?.heat ?? null,
  ```
  (key order `name, at, readout, temp, rest, heat, motion`). Run Step 1: PASS.

- [ ] **Step 3: Failing overlay unit** — `tests/card/three-overlay-pill.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createOverlay } from "../../src/card/three/overlay";

// S29 (H6): the overlay draws a room's temperature on a pill, as text (never markup), and recolours it on a heat change alone.
const room = (heat: number | null, temp = "16 °C", rest = "48 %") => ({
  name: "Living",
  at: [10, 20],
  readout: [temp, rest].filter(Boolean).join(" · "),
  temp,
  rest,
  heat,
  motion: null,
});
const liveWith = (r: ReturnType<typeof room>) =>
  ({ night: false, labels: true, names: false, pulse: [3, 1], lights: [], doors: [], devices: [], pieces: [], rooms: [r] }) as never;
const anchors = { devices: new Map(), rooms: new Map([[0, [10, 0, 20] as const]]) };
afterEach(() => (document.body.innerHTML = ""));

describe("overlay: the temperature pill", () => {
  it("puts the temperature in span.val-pill with --fp-temp-t, the rest after it; the text equals the readout", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(0)), anchors as never);
    const val = box.querySelector(".fp3-rm .fp3-val")!,
      pill = val.querySelector("span.val-pill") as HTMLElement;
    expect(pill.textContent).toBe("16 °C");
    expect(pill.style.getPropertyValue("--fp-temp-t")).toBe("0");
    expect(val.textContent).toBe("16 °C · 48 %");
    o.set(liveWith(room(1)), anchors as never);
    expect((box.querySelector(".fp3-val span.val-pill") as HTMLElement).style.getPropertyValue("--fp-temp-t")).toBe("1");
    o.dispose();
  });
  it("no heat, or no temperature, is plain text as before", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(null)), anchors as never);
    expect(box.querySelector(".fp3-val span")).toBeNull();
    o.set(liveWith(room(0.5, "", "48 %")), anchors as never);
    expect(box.querySelector(".fp3-val span")).toBeNull();
    expect(box.querySelector(".fp3-val")!.textContent).toBe("48 %");
    o.dispose();
  });
  it("a payload in the text stays text", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(0.5, '"><img src=x onerror=alert(1)>', "")), anchors as never);
    expect(box.querySelector("img")).toBeNull();
    o.dispose();
  });
});
```
Run `npx vitest run tests/card/three-overlay-pill.test.ts`: FAIL (no span).

- [ ] **Step 4: Implement the overlay.** In `overlay.ts`:
  - `CSS`, append before the closing backtick:
  ```css
  .fp3-val .val-pill{display:inline-block;padding:0 4px;margin:0 -2px;border-radius:999px;background:color-mix(in srgb,var(--fp-temp) 35%,transparent)}
  .fp3-ic g.dev:not(.on):not(.danger):not(.unavailable) .halo.heat{stroke:var(--fp-temp);stroke-width:2}
  ```
  (The second rule is Review focus 3: it must outrank the idle-disc rule at line 68.)
  - Room `set` (line 323): `const sig = \`${lr.name}\u0000${lr.readout}\u0000${lr.heat ?? ""}\`;` and replace `it.val.textContent = lr.readout;` with:
  ```ts
  // S29 (H6): the temperature on a pill whose colour the card's stylesheet mixes from --fp-temp-t; the rest stays plain text.
  if (lr.heat !== null && lr.temp) {
    const pill = text("val-pill", lr.temp);
    pill.style.setProperty("--fp-temp-t", String(lr.heat));
    it.val.replaceChildren(pill, ...(lr.rest ? [document.createTextNode(` · ${lr.rest}`)] : []));
  } else it.val.textContent = lr.readout;
  ```
  Run Step 3: PASS.

- [ ] **Step 5: Failing 3D spec (AC 15, Review focus 3)** — `tests/card/card-3d-temp.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, holder, drawn, cam } from "./helpers-3d";

// S29 (H6, AC 15, Review focus 3): the 3D readout's pill and the temp icon's ring, read from Chromium on the overlay itself.
// Same rooms as temp-pill-2d.spec.ts: Living 16 °C (and 48 %), Kitchen 21, Hall 26, Garden 18.5; bounds 16 and 26.
const HA_DARK =
  "--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--card-background-color:#1c1c1c;--secondary-background-color:#282828";
const st = (state: string, unit: string) => ({ state, attributes: { unit_of_measurement: unit }, last_changed: new Date().toISOString() });
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
      const el = document.getElementById("card") as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
      el.setConfig(config);
      el.hass = { states: s, themes: { darkMode: isDark }, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: layout(), floor: "ground", view: "3d", theme, active_list: false, heat_min: 16, heat_max: 26 }, vars, dark, states()] as const,
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
        return h ? { cls: h.getAttribute("class"), stroke: getComputedStyle(h).stroke, width: getComputedStyle(h).strokeWidth } : null;
      })(),
    };
    probe.remove();
    return out;
  });
const mix = (a: number[], b: number[], s: number) => a.map((v, k) => v * s + b[k]! * (1 - s));
const want = (t: number, c: number[], m: number[], h: number[]) => (t <= 0.5 ? mix(c, m, 1 - 2 * t) : mix(m, h, 2 - 2 * t));
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
```
Run `PW_PORT=5275 npx playwright test tests/card/card-3d-temp.spec.ts`, `echo $?`. Before Step 4's overlay CSS: FAIL. After: PASS. `--repeat-each=10`, `echo $?`, 0. Break once: drop the overlay ring rule; Review focus 3 fails (stroke is `--fp-idle`). Restore.

- [ ] **Step 6: Look.** `npm run shots`, `echo $?`. Open the 3D `roomsensors` shots (if the 3D set has none, the card 3D shots of the ground floor) in the three themes and look at the Living readout chip: the pill inside the chip, text readable, chip size unchanged except for the pill padding.

- [ ] **Step 7: Scoped suites.** `npx vitest run`, typecheck, lint, format:check, each `echo $?` (0).
`PW_PORT=5275 npx playwright test tests/card/card-3d-temp.spec.ts tests/card/card-3d-chips.spec.ts tests/card/card-3d-live.spec.ts tests/card/card-3d-labels.spec.ts tests/card/card-3d-off-devices.spec.ts tests/card/size-budget.spec.ts` (found by `grep -lE "fp3-val|fp3-rm|readout|\.halo" tests/card/card-3d*.spec.ts`), then `echo $?`. Expected 0.

- [ ] **Step 8: Records.** `CHANGELOG.md`: `- 3D: a room's temperature is on the same coloured pill as in 2D, and a temperature icon wears the same ring.` `FORK.md`, new top entry `## 2026-10-12: Sprint 29, temperature pill in 3D (branch \`task/s29-5\`)`: `- \`LiveRoom\` carries \`temp\`, \`rest\`, \`heat\`; the overlay draws \`span.val-pill\` and the idle ring rule.`

- [ ] **Step 9: Commit**

```bash
git add src/core/live-build.ts src/core/three-deps.ts src/card/three/overlay.ts tests/core/live.test.ts tests/card/three-overlay-pill.test.ts tests/card/card-3d-temp.spec.ts CHANGELOG.md FORK.md
git commit -m "Put a room's temperature on a coloured pill in 3D"
```

---

## Task S29.6 (Group B, after S29.2): cover art in the card, failed images, the patch path

Branch `task/s29-6` off `task/s29-integrate`, `PW_PORT=5276`.

**Files:**
- Modify: `src/card/floorplan-studio-card.ts`: a module constant near the other limits; fields near `_kept` (689); `connectedCallback` (1290-1310) and `disconnectedCallback` (1456-1470); `setLive` (2054-2072) and `renderFloor` (4050-4078) options
- Modify: `src/card/three/overlay.ts` header comment (lines 1-7)
- Modify: `scripts/shots.mjs`: `STATES.on` for `media_player.demo_sonos` (line 263) and the two `page.route` handlers (568-578, 1239-…)
- Create: `tests/card/card-art.spec.ts`, `tests/card/card-art-failed.test.ts`
- Records: `CHANGELOG.md`, `FORK.md`, `docs/DECISIONS.md`

**Interfaces:**
- Consumes: `artUrl`, `RenderOpts.mediaArt`, `RenderOpts.artFailed`, `deviceMarkup` art markup, `_mediaArt()` (S29.2).
- Produces:
  ```ts
  const ART_FAILED_MAX = 64;
  private _artFailed: Set<string>;                 // insertion order = age
  private _onArtError: (e: Event) => void;         // capturing, on this.renderRoot
  // renderFloor and setLive options gain artFailed: this._artFailed
  ```

- [ ] **Step 1: Failing unit (Review focus 5)** — `tests/card/card-art-failed.test.ts` (the `vi.mock`, `lastOpts`, `beforeEach`/`afterEach` header of `card-temp-config.test.ts`), with:

```ts
const L = demo as unknown as Layout;
const layout = () => {
  const l = structuredClone(L);
  l.floors.ground.devices.push({ id: "spk", type: "speaker", entity: "media_player.kitchen", name: "Kitchen speaker", x: 700, y: 300 } as never);
  return l;
};
const hassWith = (href: string) => ({
  states: { "media_player.kitchen": { state: "playing", attributes: { entity_picture_local: href }, last_changed: "2026-10-12T10:00:00Z" } },
  callService: () => undefined,
});
async function mount(href: string) {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: layout(), floor: "ground" } as FloorplanStudioCardConfig);
  el.hass = hassWith(href) as never;
  await el.updateComplete;
  return el;
}
const fail = async (el: FloorplanStudioCard) => {
  const img = el.shadowRoot!.querySelector("svg image.art");
  expect(img, "an image to fail").not.toBeNull();
  img!.dispatchEvent(new Event("error")); // does not bubble: only a capturing listener above it sees it
  await el.updateComplete;
};

describe("failed cover art (S29, A6, Review focus 5)", () => {
  it("an image that fails is drawn as the glyph after one render", async () => {
    const el = await mount("/api/a.png?cache=1");
    const calls = (renderFloor as unknown as Mock).mock.calls.length;
    await fail(el);
    expect(lastOpts().artFailed?.has("/api/a.png?cache=1")).toBe(true);
    expect(el.shadowRoot!.querySelector("svg image.art")).toBeNull();
    await el.updateComplete;
    expect((renderFloor as unknown as Mock).mock.calls.length - calls).toBe(1); // one render, no loop
  });
  it("the set holds 64, drops the oldest, and a dropped href is tried again", async () => {
    const el = await mount("/api/x.png?n=0");
    for (let n = 0; n < 70; n++) {
      el.hass = hassWith(`/api/x.png?n=${n}`) as never;
      await el.updateComplete;
      await fail(el);
    }
    const set = lastOpts().artFailed!;
    expect(set.size).toBe(64);
    expect(set.has("/api/x.png?n=0")).toBe(false);
    expect(set.has("/api/x.png?n=69")).toBe(true);
    el.hass = hassWith("/api/x.png?n=0") as never;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("svg image.art")?.getAttribute("href")).toBe("/api/x.png?n=0");
  });
  it("an error from anything else (another image, a script) is ignored", async () => {
    const el = await mount("/api/b.png");
    const other = document.createElementNS("http://www.w3.org/2000/svg", "image");
    el.shadowRoot!.querySelector("svg")!.appendChild(other);
    other.dispatchEvent(new Event("error"));
    await el.updateComplete;
    expect(lastOpts().artFailed?.size ?? 0).toBe(0);
  });
});
```
Run `npx vitest run tests/card/card-art-failed.test.ts`: FAIL (`artFailed` undefined).

- [ ] **Step 2: Implement.** In `src/card/floorplan-studio-card.ts`:
  - Module constant beside the other limits: `/** S29 (A6): the most failed cover-art hrefs remembered; state is untrusted and can churn URLs. */ const ART_FAILED_MAX = 64;`
  - Fields, after `_kept` (689):
  ```ts
  /** S29 (A6): cover-art hrefs that failed to load, oldest first. Such a speaker draws its glyph; a new href is tried again. */
  private _artFailed = new Set<string>();
  /** S29 (A6): an `<image>`'s `error` does not bubble; one capturing listener on the shadow root sees the plan's and the 3D overlay's.
   *  Tested by tag and namespace, not `instanceof SVGImageElement`: jsdom has no such class. */
  private _onArtError = (e: Event): void => {
    const t = e.target;
    if (
      !(t instanceof Element) ||
      t.localName !== "image" ||
      t.namespaceURI !== "http://www.w3.org/2000/svg" ||
      !t.classList.contains("art")
    )
      return;
    const href = t.getAttribute("href");
    if (!href || this._artFailed.has(href)) return;
    this._artFailed.add(href);
    while (this._artFailed.size > ART_FAILED_MAX) this._artFailed.delete(this._artFailed.values().next().value as string);
    this.requestUpdate();
  };
  ```
  - `connectedCallback`, after `super.connectedCallback();`: `this.renderRoot.addEventListener("error", this._onArtError, true);`. `disconnectedCallback`, after `super.disconnectedCallback();`: `this.renderRoot.removeEventListener("error", this._onArtError, true);`.
  - `artFailed: this._artFailed,` after `mediaArt` in the `setLive` and `renderFloor` options.
  - `overlay.ts` header (lines 6-7): end the paragraph with "The icon may hold one outside value, a cover-art href; core lets only a same-origin path through (`artUrl`) and escapes it."
  Run Step 1: PASS.

- [ ] **Step 3: Failing browser spec (AC 6-9)** — `tests/card/card-art.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";

// S29 (A1-A7, AC 6-9): cover art in the built card, 2D and 3D, served as Home Assistant serves it. The image proxy is a route
// here: `cache=ok…` answers an SVG cover, anything else 404. Every request the page makes is recorded by `serve` (helpers-3d.ts).
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c33"/></svg>`;
const href = (cache: string) => `/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=${cache}`;
const SPK = 12;
const layout = () => {
  const l = structuredClone(demo);
  l.floors.ground.devices.push({ id: "spk", type: "speaker", entity: "media_player.kitchen", name: "Kitchen speaker", x: 700, y: 300 });
  return l;
};
const speaker = (state: string, attributes: Record<string, unknown>) => ({
  "media_player.kitchen": { state, attributes, last_changed: new Date().toISOString() },
});
async function boot(page: Page, view: "2d" | "3d", s: Record<string, unknown>) {
  const seen = await serve(page);
  await page.route(`${ORIGIN}/api/media_player_proxy/**`, (r) =>
    new URL(r.request().url()).searchParams.get("cache")?.startsWith("ok")
      ? r.fulfill({ body: COVER, contentType: "image/svg+xml" })
      : r.fulfill({ status: 404, body: "" }),
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, s]) => {
      const el = document.getElementById("card") as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
      el.setConfig(config);
      el.hass = { states: s, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: layout(), floor: "ground", view, theme: "light", active_list: false }, s] as const,
  );
  if (view === "3d") await drawn(page);
  return seen;
}
const setStates = (page: Page, s: Record<string, unknown>) =>
  page.evaluate((s) => {
    const el = document.getElementById("card") as unknown as { hass: Record<string, unknown>; updateComplete: Promise<unknown> };
    el.hass = { ...el.hass, states: s };
    return el.updateComplete;
  }, s);
const art2d = (page: Page) =>
  card(page).evaluate((el, i) => el.shadowRoot!.querySelector(`svg g[data-x="${i}"] image.art`)?.getAttribute("href") ?? null, SPK);
const art3d = (page: Page) =>
  holder(page).evaluate((root, i) => root.querySelector(`svg.fp3-ic[data-i="${i}"] image.art`)?.getAttribute("href") ?? null, SPK);

test("AC 6, 2D: playing with a valid entity_picture_local draws image.art with that href; other states draw the glyph", async ({ page }) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art2d(page)).toBe(href("ok1"));
  for (const s of ["paused", "idle", "off", "unavailable"]) {
    await setStates(page, speaker(s, { entity_picture_local: href("ok1") }));
    await expect.poll(() => art2d(page), s).toBeNull();
  }
});

test("AC 6, 3D: the overlay icon carries the same image", async ({ page }) => {
  await boot(page, "3d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art3d(page)).toBe(href("ok1"));
  await setStates(page, speaker("paused", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art3d(page)).toBeNull();
});

test("AC 7: in the 3D harness every refused URL draws the glyph and requests nothing off-origin", async ({ page }) => {
  const seen = await boot(page, "3d", speaker("playing", {}));
  for (const v of ["//h/x", "/\\h/x", "javascript:x", "data:image/png;base64,x", '"><script>', "/" + "a".repeat(2999), "http://192.168.1.10:8095/imageproxy/x"]) {
    await setStates(page, speaker("playing", { entity_picture_local: v, entity_picture: v }));
    await expect.poll(() => art3d(page), v.slice(0, 30)).toBeNull();
  }
  await page.waitForTimeout(300); // give a stray request the time to show
  expect(seen.filter((u) => !u.startsWith(ORIGIN))).toEqual([]);
  expect(seen.filter((u) => u.includes("imageproxy") || u.includes("/h/x"))).toEqual([]);
});

test("AC 8: an image that 404s gives way to the glyph; a new href draws an image again", async ({ page }) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("bad1") }));
  await expect.poll(() => art2d(page)).toBeNull();
  expect(
    await card(page).evaluate((el, i) => getComputedStyle(el.shadowRoot!.querySelector(`svg g[data-x="${i}"] path`)!).display, SPK),
  ).not.toBe("none");
  await setStates(page, speaker("playing", { entity_picture_local: href("ok2") }));
  await expect.poll(() => art2d(page)).toBe(href("ok2"));
});

test("AC 9: an href change patches the image in place; another device's group keeps its expando", async ({ page }) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art2d(page)).toBe(href("ok1"));
  await card(page).evaluate((el, i) => {
    const svg = el.shadowRoot!.querySelector("svg")!;
    (svg.querySelector('g[data-x="0"]') as unknown as { __keep: number }).__keep = 1;
    (window as unknown as { __img: Element }).__img = svg.querySelector(`g[data-x="${i}"] image.art`)!;
  }, SPK);
  await setStates(page, speaker("playing", { entity_picture_local: href("ok2") }));
  const r = await card(page).evaluate((el, i) => {
    const svg = el.shadowRoot!.querySelector("svg")!,
      img = svg.querySelector(`g[data-x="${i}"] image.art`);
    return {
      keep: (svg.querySelector('g[data-x="0"]') as unknown as { __keep?: number }).__keep,
      same: img === (window as unknown as { __img: Element }).__img,
      href: img?.getAttribute("href"),
    };
  }, SPK);
  expect(r).toEqual({ keep: 1, same: true, href: href("ok2") });
});
```
Run `PW_PORT=5276 npx playwright test tests/card/card-art.spec.ts`, `echo $?`. Before Step 2: AC 8 FAILS (a 404 leaves the broken image). After Step 2: PASS. `--repeat-each=10`, `echo $?`, 0. Break once: remove the `addEventListener` line; AC 8 fails; restore.

- [ ] **Step 4: Shots carry art.** In `scripts/shots.mjs` line 263, make the sonos playing state carry art: `"media_player.demo_sonos": ["playing", { entity_picture_local: "/api/media_player_proxy/media_player.demo_sonos?token=FAKE&cache=shots" }]`. In both `page.route` handlers (568-578 and 1239-…), before the 404, add:
  ```js
  if (url.pathname.startsWith("/api/media_player_proxy/"))
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#e94"/><stop offset="1" stop-color="#638"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="32" r="9" fill="#fff"/></svg>',
    });
  ```
  (A fake token, A7. The 2.5D shots load through `setContent` and draw the glyph after the image fails: that is the card's real fallback, not a defect.)
  Run `npm run shots`, `echo $?`. Open the 2D and 3D "on" shots with the Sonos at 4x, blueprint, light and HA dark: the cover fills the disc, the ring is the speaker colour, the waves still show. At `far` (the detail shots) it is a dot. Then `-- --accept` after looking.

- [ ] **Step 5: Scoped suites.** `npx vitest run`, typecheck, lint, format:check, each `echo $?` (0).
`PW_PORT=5276 npx playwright test tests/card/card-art.spec.ts tests/card/art-css.spec.ts tests/card/plan-incremental.spec.ts tests/card/card-3d-live.spec.ts tests/card/card-3d-icons.spec.ts tests/card/card-3d-linked-piece.spec.ts tests/card/card-device-solids.spec.ts tests/card/card.spec.ts tests/card/size-budget.spec.ts` (found by `grep -lE "speaker|playing|fp3-ic|planPatch|plan-incremental" tests/card/*.spec.ts`), then `echo $?`. Expected 0.

- [ ] **Step 6: Records.**
  - `CHANGELOG.md`: `- Cover art in the card, 2D and 3D: an image that cannot load is replaced by the icon, and a new picture is tried again.`
  - `FORK.md`, new top entry `## 2026-10-12: Sprint 29, cover art in the card (branch \`task/s29-6\`)`: `- One capturing \`error\` listener on the card's shadow root keeps a bounded set of failed art hrefs (\`ART_FAILED_MAX\` 64), passed to both views as \`artFailed\`; the shots serve a fake cover.`
  - `docs/DECISIONS.md`, new top entry:
  ```markdown
  ## 2026-10-12: one capturing error listener for cover art (Sprint 29)

  The spec put a capturing `error` listener on the plan `<svg>` and another on the 3D overlay root. Both live in the card's
  shadow root, and a capturing listener there sees every `<image>` failing under it, so there is one, added in
  `connectedCallback` and removed in `disconnectedCallback`. Only an `image.art` counts. The failed set holds 64 hrefs, oldest
  dropped; a dropped href is tried again.
  ```

- [ ] **Step 7: Commit**

```bash
git add src/card/floorplan-studio-card.ts src/card/three/overlay.ts scripts/shots.mjs tests/card/card-art.spec.ts tests/card/card-art-failed.test.ts CHANGELOG.md FORK.md docs/DECISIONS.md
git commit -m "Fall back to the icon when cover art fails to load"
```

---

## Task S29.7 (Group B, after S29.1 and S29.2): the switches, view memory, YAML docs, config editor

Branch `task/s29-7` off `task/s29-integrate`, `PW_PORT=5277`.

**Files:**
- Modify: `src/card/view-state.ts`: `StoredView` (75-95), `parseStoredView` (163-177)
- Modify: `src/card/floorplan-studio-card.ts`: fields near `_pickedGhost` (682); `_viewStorageKey` (861-876); `_loadViewState` (882-920); `_saveViewNow` (957-985); `_mediaArt()` and `_tempColors()` (from S29.1/S29.2); `_lookControls` (4213-4233); `_modified` (4261-4280); `_resetView` (4284-4296)
- Modify: `src/card/config-editor.ts`: defaults (25-56), handlers (beside `_onRoomGlow`, 305-307), rows (after `room_glow`, 514-517)
- Modify: `docs/card.md`: config table (lines 32-58), View options description, a "Cover art" and a "Temperature colours" subsection
- Modify: `tests/card/view-state.test.ts`, `tests/card/card-view-memory.test.ts`, `tests/card/config-editor.spec.ts`
- Create: `tests/card/card-view-art-heat.spec.ts`
- Records: `CHANGELOG.md`, `FORK.md`

**Interfaces:**
- Consumes: `_mediaArt()`, `_tempColors()`, `heatBounds`.
- Produces:
  ```ts
  StoredView.art?: boolean; StoredView.heat?: boolean;   // parsed with typeof === "boolean"
  private _pickedArt: boolean | null; private _pickedHeat: boolean | null;
  private _mediaArt(): boolean          // this._pickedArt ?? this._config.media_art !== false
  private _tempColors(): [number, number] | undefined // (this._pickedHeat ?? this._config.temp_colors !== false) ? heatBounds(...) : undefined
  // View options: buttons aria-label "Cover art" and "Temperature colours", aria-pressed
  // storage key seed: media_art, temp_colors, heat_min, heat_max when set
  // config editor: #media_art, #temp_colors (checkbox), #heat_min, #heat_max (number)
  ```

- [ ] **Step 1: Failing units.**
  - `tests/card/view-state.test.ts`, in "parseStoredView: untrusted storage, field by field":
  ```ts
  it("S29: art and heat are kept only as booleans", () => {
    expect(parseStoredView({ art: false, heat: true }, isView, THEMES)).toMatchObject({ art: false, heat: true });
    const junk = parseStoredView({ art: "no", heat: 0 }, isView, THEMES);
    expect("art" in junk || "heat" in junk).toBe(false);
  });
  ```
  (Use the file's own `isView`/theme list names if they differ.)
  - `tests/card/card-view-memory.test.ts`, new describe after the ghost one (uses the file's `mount`, `btn`, `click`, `lastOpts`, `stored`):
  ```ts
  describe("Cover art and Temperature colours: YAML default and the viewer's choice (S29, AC 11, AC 16)", () => {
    it("each button toggles its option, is remembered, and the pick wins over YAML; Reset view goes back to YAML", async () => {
      const a = await mount();
      expect(btn(a, "Cover art")!.getAttribute("aria-pressed")).toBe("true");
      expect(btn(a, "Temperature colours")!.getAttribute("aria-pressed")).toBe("true");
      await click(a, "Cover art");
      await click(a, "Temperature colours");
      expect(lastOpts().mediaArt).toBe(false);
      expect(lastOpts().tempColors).toBeUndefined();
      a.remove();
      const b = await mount(); // a reload: the stored picks
      expect(lastOpts().mediaArt).toBe(false);
      expect(lastOpts().tempColors).toBeUndefined();
      await click(b, "Reset view");
      expect(lastOpts().mediaArt).toBe(true);
      expect(lastOpts().tempColors).toEqual([17, 25]);
      expect(stored()).toEqual([]);
    });
    it("YAML false starts off; junk YAML is on; the YAML bounds reach renderFloor and bad ones are 17 and 25", async () => {
      const off = await mount({ media_art: false, temp_colors: false });
      expect(lastOpts().mediaArt).toBe(false);
      expect(lastOpts().tempColors).toBeUndefined();
      expect(btn(off, "Cover art")!.getAttribute("aria-pressed")).toBe("false");
      off.remove();
      const junk = await mount({ media_art: "no" as never, temp_colors: 0 as never, heat_min: 30, heat_max: 20 });
      expect(lastOpts().mediaArt).toBe(true);
      expect(lastOpts().tempColors).toEqual([17, 25]);
      junk.remove();
      await mount({ heat_min: 16, heat_max: 26 });
      expect(lastOpts().tempColors).toEqual([16, 26]);
    });
    it("Reset view does not touch Layers (S4)", async () => {
      const a = await mount();
      (a as unknown as { _hiddenLayers: string[] })._hiddenLayers = ["lights"];
      await click(a, "Cover art");
      await click(a, "Reset view");
      expect(lastOpts().hiddenLayers).toEqual(["lights"]);
    });
    it("a YAML change starts a clean memory: the four keys join the storage key", async () => {
      const a = await mount();
      await click(a, "Cover art");
      a.remove();
      for (const k of [{ media_art: true }, { temp_colors: true }, { heat_min: 16 }, { heat_max: 26 }]) {
        await mount(k);
        expect(lastOpts().mediaArt, JSON.stringify(k)).toBe(true);
        document.body.innerHTML = "";
      }
    });
  });
  ```
  Run `npx vitest run tests/card/view-state.test.ts tests/card/card-view-memory.test.ts`: FAIL (no "Cover art" button).

- [ ] **Step 2: Implement.**
  - `view-state.ts`, `StoredView`: add `/** S29: the View options' Cover art; it wins over YAML \`media_art\`. */ art?: boolean;` and `/** S29: the View options' Temperature colours; it wins over YAML \`temp_colors\`. */ heat?: boolean;`. In `parseStoredView`, after the `ghost` line: `if (typeof r.art === "boolean") out.art = r.art; if (typeof r.heat === "boolean") out.heat = r.heat;`.
  - Card fields after `_pickedGhost` (682): `/** S29: Cover art and Temperature colours in View options; \`null\` means the config's own. */ private _pickedArt: boolean | null = null; private _pickedHeat: boolean | null = null;`
  - `_mediaArt()`: `return this._pickedArt ?? this._config.media_art !== false;`. `_tempColors()`: `return (this._pickedHeat ?? this._config.temp_colors !== false) ? heatBounds(this._config.heat_min, this._config.heat_max) : undefined;`.
  - `_viewStorageKey`, after the `floors_below` line: four `if (c.<key> !== undefined) seed.push(["<key>", c.<key>]);` lines for `media_art`, `temp_colors`, `heat_min`, `heat_max`.
  - `_loadViewState`: add both to the `= null` chain; after `below`: `if (s.art !== undefined) this._pickedArt = s.art; if (s.heat !== undefined) this._pickedHeat = s.heat;`.
  - `_saveViewNow`: after `below`: `if (this._pickedArt !== null) o.art = this._pickedArt; if (this._pickedHeat !== null) o.heat = this._pickedHeat;`.
  - `_modified`: add `this._pickedArt, this._pickedHeat` to the array. `_resetView`: add both to the `= null` chain (Layers untouched).
  - `_lookControls`, after the Device names button (before `${in3d ? null : this._ghostButton()}`):
  ```ts
  <button type="button" aria-label="Cover art" title="Cover art" aria-pressed=${art ? "true" : "false"} @click=${() => {
    this._pickedArt = !art;
    this._saveViewNow();
    this.requestUpdate();
  }}><b aria-hidden="true">♪</b><span>Cover art</span></button>
  <button type="button" aria-label="Temperature colours" title="Temperature colours" aria-pressed=${heat ? "true" : "false"} @click=${() => {
    this._pickedHeat = !heat;
    this._saveViewNow();
    this.requestUpdate();
  }}><b aria-hidden="true">°</b><span>Temperature colours</span></button>
  ```
  with `const art = this._mediaArt(), heat = this._tempColors() !== undefined;` at the top. Update the `_viewControls` doc comment's list of look controls.
  Run Step 1: PASS.

- [ ] **Step 3: Config editor, test first** — append to `tests/card/config-editor.spec.ts`:

```ts
test("S29: media_art and temp_colors checkboxes and the two bounds: defaults shown, defaults dropped, picks written", async ({ page }) => {
  await open(page);
  await mount(page, { layout: demo });
  const editor = page.locator("#editor");
  await expect(editor.locator("#media_art")).toBeChecked();
  await expect(editor.locator("#temp_colors")).toBeChecked();
  await expect(editor.locator("#heat_min")).toHaveValue("17");
  await expect(editor.locator("#heat_max")).toHaveValue("25");
  await editor.locator("#media_art").uncheck();
  let detail = (await events(page)).at(-1) as { config: Record<string, unknown> };
  expect(detail.config.media_art).toBe(false);
  await editor.locator("#media_art").check();
  detail = (await events(page)).at(-1) as { config: Record<string, unknown> };
  expect("media_art" in detail.config).toBe(false);
  await editor.locator("#temp_colors").uncheck();
  detail = (await events(page)).at(-1) as { config: Record<string, unknown> };
  expect(detail.config.temp_colors).toBe(false);
  await editor.locator("#heat_min").fill("16");
  await editor.locator("#heat_min").dispatchEvent("change");
  detail = (await events(page)).at(-1) as { config: Record<string, unknown> };
  expect(detail.config.heat_min).toBe(16);
  await editor.locator("#heat_max").fill("");
  await editor.locator("#heat_max").dispatchEvent("change");
  detail = (await events(page)).at(-1) as { config: Record<string, unknown> };
  expect("heat_max" in detail.config).toBe(false);
});
```
Run `PW_PORT=5277 npx playwright test tests/card/config-editor.spec.ts -g S29`, `echo $?`: FAIL. Then in `config-editor.ts`:
  - Defaults: `const DEFAULT_MEDIA_ART = true; const DEFAULT_TEMP_COLORS = true; const DEFAULT_HEAT_MIN = 17, DEFAULT_HEAT_MAX = 25;` (comment: "match HEAT_MIN/HEAT_MAX in core/readings.ts").
  - Handlers beside `_onRoomGlow`:
  ```ts
  private _onMediaArt(e: Event): void {
    this._set("media_art", (e.target as HTMLInputElement).checked, DEFAULT_MEDIA_ART);
  }
  private _onTempColors(e: Event): void {
    this._set("temp_colors", (e.target as HTMLInputElement).checked, DEFAULT_TEMP_COLORS);
  }
  private _onTempBound(key: "heat_min" | "heat_max", dflt: number, e: Event): void {
    // An emptied or non-numeric field is the default. A pair that is no range is the card's to resolve (17 and 25).
    const raw = (e.target as HTMLInputElement).value.trim();
    const n = Number(raw);
    this._set(key, raw !== "" && Number.isFinite(n) ? n : dflt, dflt);
  }
  ```
  (bind them like `_onRoomGlow` is bound, if the class binds handlers in its constructor or uses arrow fields).
  - Rows after `room_glow`:
  ```ts
  <div class="row">
    <label class="main" for="media_art">Cover art on playing speakers</label>
    <input id="media_art" type="checkbox" .checked=${this._config.media_art !== false} @change=${this._onMediaArt} />
  </div>
  <div class="row">
    <label class="main" for="temp_colors">Temperature colours</label>
    <input id="temp_colors" type="checkbox" .checked=${this._config.temp_colors !== false} @change=${this._onTempColors} />
  </div>
  <div class="row">
    <label class="main" for="heat_min">Cold at (°C)</label>
    <input id="heat_min" type="number" step="0.5" .value=${String(this._config.heat_min ?? DEFAULT_HEAT_MIN)} @change=${(e: Event) => this._onTempBound("heat_min", DEFAULT_HEAT_MIN, e)} />
  </div>
  <div class="row">
    <label class="main" for="heat_max">Hot at (°C)</label>
    <input id="heat_max" type="number" step="0.5" .value=${String(this._config.heat_max ?? DEFAULT_HEAT_MAX)} @change=${(e: Event) => this._onTempBound("heat_max", DEFAULT_HEAT_MAX, e)} />
  </div>
  ```
  Run again: PASS.

- [ ] **Step 4: Failing browser spec (AC 11, AC 16 with real clicks and a reload)** — `tests/card/card-view-art-heat.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";
import { openViewMenu, viewControl } from "./shell-helpers";

// S29 (S1-S5, AC 11, AC 16): the two View options rows in the built card, real clicks, the real localStorage and a real reload.
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c33"/></svg>`;
const ART = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=ok1";
const layout = () => {
  const l = structuredClone(demo);
  l.floors.ground.devices.push({ id: "spk", type: "speaker", entity: "media_player.kitchen", name: "Kitchen speaker", x: 700, y: 300 });
  Object.assign(l.floors.ground.rooms[0], { temps: ["sensor.t_living"] });
  return l;
};
const STATES = {
  "media_player.kitchen": { state: "playing", attributes: { entity_picture_local: ART }, last_changed: new Date().toISOString() },
  "sensor.t_living": { state: "16", attributes: { unit_of_measurement: "°C" }, last_changed: new Date().toISOString() },
  "sensor.demo_living_temperature": { state: "16", attributes: { unit_of_measurement: "°C" }, last_changed: new Date().toISOString() },
};
async function boot(page: Page, view: "2d" | "3d", extra: Record<string, unknown> = {}, clear = true) {
  if (clear) {
    await serve(page);
    await page.route(`${ORIGIN}/api/media_player_proxy/**`, (r) => r.fulfill({ body: COVER, contentType: "image/svg+xml" }));
    await page.setViewportSize({ width: 1100, height: 800 });
  }
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, s, clear]) => {
      if (clear) localStorage.clear();
      const el = document.getElementById("card") as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
      el.setConfig(config);
      el.hass = { states: s, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: layout(), floor: "ground", view, theme: "light", active_list: false, ...extra }, STATES, clear] as const,
  );
  if (view === "3d") await drawn(page);
}
const count = (page: Page, sel: string) => card(page).evaluate((el, sel) => el.shadowRoot!.querySelectorAll(sel).length, sel);
const count3d = (page: Page, sel: string) => holder(page).evaluate((root, sel) => root.querySelectorAll(sel).length, sel);
const button = (page: Page, name: string) => card(page).locator(`button[aria-label="${name}"]`);

test("AC 11: Cover art off draws the glyph only, and the pick survives a reload", async ({ page }) => {
  await boot(page, "2d");
  await expect.poll(() => count(page, "svg image.art")).toBe(1);
  await openViewMenu(page);
  await button(page, "Cover art").click();
  await expect(button(page, "Cover art")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => count(page, "svg image.art")).toBe(0);
  await boot(page, "2d", {}, false); // a reload: same config, the stored pick
  await expect.poll(() => count(page, "svg g.dev-speaker")).toBe(1);
  expect(await count(page, "svg image.art")).toBe(0);
});

test("AC 16: Temperature colours off: no pill and no ring in 2D or 3D, and the pick survives a reload", async ({ page }) => {
  await boot(page, "2d");
  await expect.poll(() => count(page, "svg rect.val-pill")).toBe(1);
  expect(await count(page, "svg .halo.heat")).toBe(1);
  await openViewMenu(page);
  await button(page, "Temperature colours").click();
  await expect.poll(() => count(page, "svg rect.val-pill")).toBe(0);
  expect(await count(page, "svg .halo.heat")).toBe(0);
  await boot(page, "2d", {}, false); // a reload with the same YAML (a changed `view` would be another memory)
  await expect.poll(() => count(page, "svg g.dev-temp")).toBe(1);
  expect(await count(page, "svg rect.val-pill")).toBe(0);
  await viewControl(page).selectOption("3d");
  await drawn(page);
  await expect.poll(() => count3d(page, ".fp3-rm")).toBeGreaterThan(0);
  expect(await count3d(page, ".val-pill")).toBe(0);
  expect(await count3d(page, ".halo.heat")).toBe(0);
});

test("AC 16: YAML temp_colors false starts off in 3D; the View options turn it on there", async ({ page }) => {
  await boot(page, "3d", { temp_colors: false });
  await expect.poll(() => count3d(page, ".fp3-rm")).toBeGreaterThan(0);
  expect(await count3d(page, ".val-pill")).toBe(0);
  await openViewMenu(page);
  await button(page, "Temperature colours").click();
  await expect.poll(() => count3d(page, ".val-pill")).toBe(1);
});
```
`boot(page, …, false)` navigates again (a real reload of the harness; the routes registered on `page` persist, and so does `localStorage` on the same origin).

Run `PW_PORT=5277 npx playwright test tests/card/card-view-art-heat.spec.ts`, `echo $?`: before Step 2 FAIL; after PASS. `--repeat-each=10`, `echo $?`, 0.

- [ ] **Step 5: Docs.** `docs/card.md`:
  - Config table, after `plug_watts`:
  ```markdown
  | `media_art` | `true` | a playing speaker or media player shows its cover art in place of its icon, in 2D and 3D. Only Home Assistant's own image proxy (`entity_picture_local`) or a relative `entity_picture` is drawn; any other address is ignored. Only `false` turns it off; junk is on. The Cover art button in View options changes it for one viewer |
  | `temp_colors` | `true` | a room's temperature sits on a pill coloured by the comfort scale, and a temperature icon wears a ring in that colour, in 2D and 3D. Only `false` turns it off; junk is on. The Temperature colours button in View options changes it for one viewer |
  | `heat_min`, `heat_max` | `17`, `25` | the comfort scale in °C: blue at `heat_min`, neutral half way, red at `heat_max`. Two numbers with min below max; anything else is `17` and `25`. A °F sensor is converted |
  ```
  - `view_switch` row: add "Cover art, Temperature colours" to the menu's list.
  - New subsections under the card behaviours (beside Plugs): "Cover art" (what shows, when: only while `playing`, every speaker of a group that reports art; far zoom shows the icon; a picture that fails shows the icon; Music Assistant's LAN `entity_picture` is not drawn, use the HA proxy) and "Temperature colours" (scale, units, the pill and ring, no legend).
  Run `npm run docs:check`, `echo $?`, 0.

- [ ] **Step 6: Scoped suites.** `npx vitest run`, typecheck, lint, format:check, each `echo $?` (0).
`PW_PORT=5277 npx playwright test tests/card/card-view-art-heat.spec.ts tests/card/config-editor.spec.ts tests/card/config-editor-detail.spec.ts tests/card/config-editor-walls.spec.ts tests/card/card-view-memory.spec.ts tests/card/card-view-reload.spec.ts tests/card/card-view-memory-3d.spec.ts tests/card/view-parity.spec.ts tests/card/card-stack.spec.ts tests/card/card-ghost.spec.ts tests/card/size-budget.spec.ts` (found by `grep -lE "View options|fp-view:|Reset view|config-editor" tests/card/*.spec.ts`), then `echo $?`. Expected 0.

- [ ] **Step 7: Records.** `CHANGELOG.md`: `- View options has Cover art and Temperature colours; each is remembered per viewer and Reset view returns to the YAML (\`media_art\`, \`temp_colors\`). The card editor has both, and the two bounds.` `FORK.md`, new top entry `## 2026-10-12: Sprint 29, switches (branch \`task/s29-7\`)`: `- \`StoredView.art\`/\`heat\`, \`_pickedArt\`/\`_pickedHeat\`, two View options rows, four keys in the view-memory seed, four config editor fields, \`docs/card.md\`.`

- [ ] **Step 8: Commit**

```bash
git add src/card/view-state.ts src/card/floorplan-studio-card.ts src/card/config-editor.ts docs/card.md tests/card/view-state.test.ts tests/card/card-view-memory.test.ts tests/card/config-editor.spec.ts tests/card/card-view-art-heat.spec.ts CHANGELOG.md FORK.md
git commit -m "Add Cover art and Temperature colours to View options and the editor"
```

---

### Merge Group B

Coordinator: merge `task/s29-4` … `task/s29-7` into `task/s29-integrate` (`--no-ff`, in order). Expected conflicts: `CHANGELOG.md`/`FORK.md`/`docs/DECISIONS.md` tops (keep both); the `setLive`/`renderFloor` option literals (S29.6 `artFailed`); `LiveDeps` and `three-deps.ts` (S29.5 `roomReadoutParts` beside S29.3 `layerHides`); `overlay.ts` (S29.5 CSS and room `set`, S29.6 header). `npx vitest run`, typecheck, lint, each `echo $?`, and the union of the four scoped lists.

---

## Task S29.8 (Group C): the Sprint 29 shot set

Branch `task/s29-8` off `task/s29-integrate`, `PW_PORT=5278`.

**Files:**
- Modify: `scripts/shots.mjs` (a `--s29` block beside `--polish`, lines 460-663; the header comment lines 1-12)

- [ ] **Step 1: The set.** Add `npm run shots -- --s29`, modelled on the `--polish` block, rendering to `shots/current/s29/`:
  - Layout: `structuredClone(layout)`; ground rooms Living (`temps` + `humidity`), Kitchen, Hall, Garden get temperature sensors; a `speaker` device `s29-speaker` at (700, 300) on `media_player.s29_speaker`; a temperature icon (the demo's device 4).
  - States: Living 16 °C and 48 %, Kitchen 21, Hall 26, Garden 18.5, device 4 at 26 (a hot ring next to a cold room), the speaker `playing` with `entity_picture_local: "/api/media_player_proxy/media_player.s29_speaker?token=FAKE&cache=s29"`; the lights on.
  - Config: `heat_min: 16`, `heat_max: 26`, `active_list: false`.
  - The route: the `ORIGIN` handler of the main shots plus the media-proxy cover of S29.6.
  - Matrix: themes blueprint, light, ha-dark (the `PT` list), day and night, views 2d and 3d, two widths: 1100 x 800 at deviceScaleFactor 2, and 375 x 720 (phone) at deviceScaleFactor 3. Names `<view>-<width>-<theme>-<day|night>.png`. Plus 4x crops (160 x 160 css px) of the Living readout, the Hall readout and the speaker, in 2D through `toScreen` and in 3D through `__fp3d.project` (as `--polish` does).
  - Fails (exit 1) when a file is missing, under its minimum size, or a page logged a console error, as `--polish` does.

- [ ] **Step 2: Run and look.** `npm run shots -- --s29`, then `echo $?` (0). Open every image with the Read tool. For each theme (light, HA dark, blueprint) and each width say in the report: the cold (Living) and hot (Hall) pills read as blue and red, the room name and the readout text are readable on both (dark themes especially), the pill does not cover the name, the cover fills the speaker's disc with a ring and waves, the far zoom dot is a dot, the 375 px layout has no clipped pill. Anything wrong goes back to its task (S29.4 2D pill, S29.5 3D pill, S29.2 art CSS) as a defect with the test that must catch it.

- [ ] **Step 3: Commit**

```bash
git add scripts/shots.mjs
git commit -m "Add the Sprint 29 shot set: pills, rings and cover art at phone width"
```

---

## Task S29.9 (Group C): integrate, verify, review, document

On `task/s29-integrate` after S29.8 is merged.

- [ ] **Step 1: Full suites, once, each bare.**
  `npm run lint`, `echo $?`; `npm run typecheck`, `echo $?`; `npx vitest run`, `echo $?`; `PW_PORT=5279 npx playwright test`, `echo $?`; `task check`, `echo $?`. All 0. Read `tests/card/size-budget.spec.ts` and `tests/card/card-3d-perf.spec.ts` results on their own (budgets unchanged). Record the real test counts.
- [ ] **Step 2: Shots.** `npm run shots`, `echo $?`; `npm run shots -- --s29`, `echo $?`. Open and look (finding 16); list what each shows.
- [ ] **Step 3: Opus review** per `docs/WORKFLOW.md` (one pass over `git diff main...task/s29-integrate`, the checklist there, the shots open beside the diff). Defects go back to the owning task's branch, test first; Opus re-checks the fixes only.
- [ ] **Step 4: Docs.**
  - `docs/SPEC.md`, "Card behaviours" (line 299): Layers in 3D (devices only, furniture chip disabled, hidden devices not tappable); cover art (when, what URL, fallback, far); temperature colours (scale, units, pill and ring, 2D and 3D, switch); the four YAML keys.
  - `docs/specs/layers-art-heat.md`: status line "Built (Sprint 29, 0.27.0)"; the token names (`--fp-temp-*`) are already in the spec.
  - `CHANGELOG.md`: check the Unreleased lines read as one release.
  - `docs/PLAN.md`: tick S29.1-S29.9 and close the sprint (what landed, real test counts, what the review found, carry-overs).
- [ ] **Step 5: Report to Diego** (WORKFLOW step 7) and ask before merge, push or tag.

---

## Acceptance criteria coverage

| AC | What | Task | Test |
|---|---|---|---|
| 1 | Lights chip in 3D: no light icon, ball or pool; "Layers · 1 hidden"; back on a second click | S29.3 | `card-3d-layers.spec.ts` "AC 1" |
| 2 | A light located by search stays with Lights hidden | S29.3 | `card-3d-layers.spec.ts` "AC 2"; `live.test.ts` "keep draws one thing" |
| 3 | Furniture chip disabled in 3D, enabled in 2D, stored state kept | S29.3 | `card-3d-layers.spec.ts` "AC 3" |
| 4 | Lights hidden: 3D to 2D no `g.dev-light`, back to 3D no light icon | S29.3 | `card-3d-layers.spec.ts` "AC 4" |
| 5 | `artUrl` accepts and refuses | S29.2 | `art.test.ts` "artUrl (AC 5)" |
| 6 | Playing speaker draws `image.art` in 2D and 3D; other states the glyph | S29.2, S29.6 | `art.test.ts` (markup, liveOf); `card-art.spec.ts` "AC 6, 2D", "AC 6, 3D" |
| 7 | Refused URLs in the 3D harness: glyph, no off-origin request | S29.6 | `card-art.spec.ts` "AC 7" |
| 8 | A 404 image gives way to the glyph; a new href draws again | S29.6 | `card-art.spec.ts` "AC 8"; `card-art-failed.test.ts` |
| 9 | Patch path: expando survives, same `image.art` node with the new href | S29.6 | `card-art.spec.ts` "AC 9" |
| 10 | Computed-style pairs for `.art` and `far` | S29.2 | `art-css.spec.ts` |
| 11 | Cover art off, reload, YAML false, junk on, Reset view | S29.2, S29.7 | `card-art-config.test.ts`; `card-view-memory.test.ts` S29 describe; `card-view-art-heat.spec.ts` "AC 11" |
| 12 | `heatT`, bounds, `meanValue`, °F, `meanReading` unchanged | S29.1 | `temp-colour.test.ts`; existing `state-text.test.ts`, `label-style.test.ts`, `room-info.test.ts` unchanged |
| 13 | 2D pill colours from tokens, humidity-only no pill, text unchanged | S29.4 | `temp-pill-2d.spec.ts` "AC 13" (plus an 18.5 °C room); `temp-colour.test.ts` "the 2D readout pill" |
| 14 | Temp icon ring cold at 16, hot at 26 | S29.4 | `temp-pill-2d.spec.ts` "AC 14" |
| 15 | 3D `span.val-pill` same colours; 16 to 26 recolours | S29.5 | `card-3d-temp.spec.ts` "AC 15"; `three-overlay-pill.test.ts` |
| 16 | Switch off: no pill or ring in 2D or 3D; reload; YAML false; junk on; Reset; bad bounds 17/25 | S29.1, S29.7 | `card-temp-config.test.ts`; `card-view-memory.test.ts` S29 describe; `card-view-art-heat.spec.ts` "AC 16" (2D and 3D) |
| 17 | Every theme, HA light and dark, resolves the three tokens | S29.1 | `temp-tokens.spec.ts` "AC 17" (names `--fp-temp-*`, decision 1) |
| Exit | Shots and phone-width screenshots, light, HA dark, blueprint, looked at | S29.4, S29.5, S29.6, S29.8, S29.9 | `npm run shots`, `npm run shots -- --s29`, report |
