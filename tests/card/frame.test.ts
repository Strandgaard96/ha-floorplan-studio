import { describe, expect, it } from "vitest";
import {
  HEADER_H,
  PEEK_H,
  cardHeight,
  frameMode,
  nextOnHandleTap,
  sheetStops,
  sideOpenByDefault,
  sideWidth,
  snapSheet,
} from "../../src/card/frame";
import type { SheetStop } from "../../src/card/frame";

// S31.2: the card frame's maths. Pure numbers, no DOM. The reasoning for the phone minimum and the snap rule sits in
// the comment block at the top of src/card/frame.ts. Velocity is px/ms of the sheet's HEIGHT: positive grows it.

const JUNK = [NaN, -5, -Infinity, Infinity, 0];
const NAMES: SheetStop[] = ["peek", "half", "full"];

describe("frameMode and the side sheet", () => {
  it("switches at 640 and opens by default at 900", () => {
    expect([639, 640].map((w) => frameMode(w))).toEqual(["bottom", "side"]);
    expect([899, 900].map(sideOpenByDefault)).toEqual([false, true]);
  });
  it("is none for a kiosk or a card with no sheet, at any width", () => {
    for (const w of [390, 640, 1280]) {
      expect(frameMode(w, { kiosk: true })).toBe("none");
      expect(frameMode(w, { sheet: false })).toBe("none");
    }
  });
  it("sideWidth is 32 % clamped to 260..320", () => {
    expect(sideWidth(640)).toBe(260); // 204.8 -> 260
    expect(sideWidth(900)).toBe(288);
    expect(sideWidth(1000)).toBe(320);
    expect(sideWidth(2000)).toBe(320);
  });
});

describe("cardHeight", () => {
  const HA = 56;
  const base = { haHeader: HA, chrome: HEADER_H, mode: "side" as const };
  const cap = (vh: number) => vh - HA - 16;
  const cases: [number, number][] = [
    [390, 844],
    [768, 1024],
    [1024, 768],
  ];
  for (const [w, vh] of cases) {
    const mode = frameMode(w);
    const chrome = mode === "bottom" ? HEADER_H + PEEK_H : HEADER_H;
    for (const [name, aspect] of [["1:3 tall", 1 / 3], ["3:1 wide", 3]] as const) {
      it(`${name} plan at ${w} wide under ${vh} high fits the screen`, () => {
        const h = cardHeight({ ...base, planAspect: aspect, width: w, viewportH: vh, chrome, mode });
        expect(h).toBeLessThanOrEqual(cap(vh));
        if (aspect > 1 && mode === "side") expect(h).toBe(w / aspect + chrome); // wide plan: natural height, not stretched
        if (aspect < 1) expect(h).toBe(cap(vh)); // tall plan: capped, the plan letterboxes
      });
    }
  }
  it("phone minimum: a short plan on a phone still gets min(screen - header, 640) less the gutter", () => {
    const h = cardHeight({ ...base, mode: "bottom", chrome: 116, planAspect: 3, width: 390, viewportH: 844 });
    expect(h).toBe(640); // natural 130 + 116 = 246 would leave half no room
    // a short screen: the minimum may not push the card past the cap
    const s = cardHeight({ ...base, mode: "bottom", chrome: 116, planAspect: 3, width: 390, viewportH: 500 });
    expect(s).toBe(500 - HA - 16);
  });
  it("the phone minimum applies to bottom mode only", () => {
    const side = cardHeight({ ...base, planAspect: 3, width: 768, viewportH: 1024 });
    expect(side).toBe(768 / 3 + HEADER_H);
    const none = cardHeight({ ...base, mode: "none", chrome: 0, planAspect: 3, width: 390, viewportH: 844 });
    expect(none).toBe(130);
  });
  it("junk never throws and answers a finite number", () => {
    for (const a of JUNK) for (const b of JUNK) for (const c of JUNK) {
      for (const mode of ["side", "bottom", "none"] as const) {
        const h = cardHeight({ planAspect: a, width: b, viewportH: c, haHeader: a, chrome: b, mode });
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThan(0);
      }
    }
    expect(Number.isFinite(cardHeight({} as never))).toBe(true);
    expect(frameMode(NaN)).toBe("bottom");
    expect([NaN, -1, Infinity].map(sideWidth).every(Number.isFinite)).toBe(true);
    expect(() => sideOpenByDefault(NaN)).not.toThrow();
  });
});

describe("sheetStops", () => {
  it("peek 64, half max(50 %, 340) capped, full the card less the header", () => {
    expect(sheetStops(844, HEADER_H)).toEqual({ peek: 64, half: 422, full: 792 });
    expect(sheetStops(640, HEADER_H)).toEqual({ peek: 64, half: 340, full: 588 });
    expect(sheetStops(420, HEADER_H)).toEqual({ peek: 64, half: 340, full: 368 });
    expect(sheetStops(380, HEADER_H)).toEqual({ peek: 64, half: 328, full: 328 }); // half capped at full
  });
  it("a card shorter than peek plus header still gives ordered finite stops", () => {
    for (const h of [0, 30, 64, 100, 115, 116, 117]) {
      const s = sheetStops(h, HEADER_H);
      expect(s.peek).toBeLessThanOrEqual(s.half);
      expect(s.half).toBeLessThanOrEqual(s.full);
      expect(s.peek).toBeLessThanOrEqual(Math.max(h, 0));
      expect(s.peek).toBeGreaterThanOrEqual(0);
    }
    expect(sheetStops(100, HEADER_H)).toEqual({ peek: 64, half: 64, full: 64 });
  });
  it("junk gives finite ordered stops", () => {
    for (const a of JUNK) for (const b of JUNK) {
      const s = sheetStops(a, b);
      expect(Object.values(s).every(Number.isFinite)).toBe(true);
      expect(s.peek <= s.half && s.half <= s.full).toBe(true);
    }
  });
});

describe("snapSheet", () => {
  const stops = sheetStops(844, HEADER_H);
  const VELS = [-2, -0.6, -0.4, 0, 0.4, 0.6, 2];
  it("every stop from every stop with every velocity", () => {
    for (let i = 0; i < 3; i++) {
      for (const v of VELS) {
        const want = Math.abs(v) > 0.5 ? Math.max(0, Math.min(2, i + Math.sign(v))) : i;
        expect(snapSheet(stops[NAMES[i]], v, stops)).toBe(NAMES[want]);
      }
    }
  });
  it("a slow drag snaps to the nearest, ties to the smaller sheet", () => {
    expect(snapSheet(200, 0, stops)).toBe("peek"); // 136 from peek, 222 from half
    expect(snapSheet(250, 0, stops)).toBe("half");
    expect(snapSheet(700, 0.4, stops)).toBe("full");
    expect(snapSheet((64 + 422) / 2, 0, stops)).toBe("peek");
  });
  it("a fling goes to the next stop its way from where the finger let go, never two", () => {
    expect(snapSheet(100, 0.6, stops)).toBe("half"); // nearest is peek; one stop up is half
    expect(snapSheet(400, 0.6, stops)).toBe("half"); // just under half, flung up: half is the next stop up, not full
    expect(snapSheet(440, -0.6, stops)).toBe("half"); // just over half, flung down: half is the next stop down, not peek
    expect(snapSheet(440, 0.6, stops)).toBe("full");
  });
  it("0.5 px/ms exactly is not a fling", () => {
    expect(snapSheet(100, 0.5, stops)).toBe("peek");
    expect(snapSheet(300, -0.5, stops)).toBe("half");
  });
  it("junk never throws", () => {
    for (const h of JUNK) for (const v of [...JUNK, 0.6]) {
      expect(NAMES).toContain(snapSheet(h, v, stops));
    }
    expect(NAMES).toContain(snapSheet(100, 1, { peek: NaN, half: NaN, full: NaN }));
  });
});

describe("nextOnHandleTap", () => {
  it("peek to half, half to peek, full to half", () => {
    expect(nextOnHandleTap("peek")).toBe("half");
    expect(nextOnHandleTap("half")).toBe("peek");
    expect(nextOnHandleTap("full")).toBe("half");
    expect(nextOnHandleTap("junk" as never)).toBe("half");
  });
});
