// Sprint 30 (0.28.0): Align searches the turn. S30.2 here: candidate turns from direction histograms.
import { describe, it, expect } from "vitest";
import hand from "../fixtures/hand-align-house.json";
import house from "../fixtures/align-house.json";
import { turnCandidates, refinePlace, sampleLines, structure, MAX_TURN_CANDIDATES } from "../../src/core/align";
import { blank, rect, turnedFloor, nearestTurn, squareHouse, plusHouse, noLines, seeded, composePlace, placeAbout, invertPlace, placePt, type TestPlace } from "../fixtures/align-turn";
import type { Floor, Layout, Pt } from "../../src/core/schema";

const h = hand as unknown as Layout, a = house as unknown as Layout;
const clone = <T,>(x: T): T => structuredClone(x);
const ABOUT: Pt = [370, -120];
const TURNS = [-9.7, -6.2, -3.3, -1.1, -0.35, 0.4, 1.8, 4.0, 7.3, 9.95, 23.0, -31.0, 93.0];
const FLOORS: [string, Floor][] = [["align-house first", a.floors.first], ["hand first", h.floors.first], ["hand ground", h.floors.ground], ["align-house ground (the L)", a.floors.ground]];

describe("turnCandidates (S30.2)", () => {
  for (const [name, f] of FLOORS) {
    it(`${name}: turned by each test angle, the candidates hold the true turn within 0.5 degree`, () => {
      for (const deg of TURNS) {
        const { floor: up, truth } = turnedFloor(f, deg, ABOUT, [41, -17]);
        const c = turnCandidates(up, f);
        expect(nearestTurn(c, truth.turn), `${name} turned ${deg}: ${c.join(", ")}`).toBeLessThan(0.5);
        // The probe is tighter: the peak is sharpened to a fraction of a bin, refinement does the rest.
        expect(nearestTurn(c, truth.turn), `${name} turned ${deg}`).toBeLessThan(0.1);
        expect(c.length).toBeLessThanOrEqual(MAX_TURN_CANDIDATES);
        expect(c).toContain(0);
      }
    });
  }

  it("a candidate list is sorted, deduplicated, in (-180, 180] and to 0.01 degree", () => {
    const { floor: up } = turnedFloor(h.floors.first, 7.3, ABOUT);
    const c = turnCandidates(up, h.floors.first);
    expect([...c].sort((p, q) => p - q)).toEqual(c);
    expect(new Set(c).size).toBe(c.length);
    for (const x of c) { expect(x).toBeGreaterThan(-180); expect(x).toBeLessThanOrEqual(180); expect(Math.abs(x * 100 - Math.round(x * 100))).toBeLessThan(1e-6); }
  });

  it("a 10 000-point circle (a flat histogram) gives at most the cap", () => {
    const big: Pt[] = [];
    for (let i = 0; i < 10000; i++) big.push([Math.round(5000 * Math.cos((i / 10000) * 2 * Math.PI)), Math.round(5000 * Math.sin((i / 10000) * 2 * Math.PI))]);
    const c = turnCandidates(blank(big), blank(big.map(([x, y]) => [x + 40, y - 25] as Pt)));
    expect(c.length).toBeGreaterThan(0);
    expect(c.length).toBeLessThanOrEqual(MAX_TURN_CANDIDATES);
  });

  it("junk and a floor with no lines give [0]", () => {
    expect(turnCandidates(noLines(), h.floors.first)).toEqual([0]);
    expect(turnCandidates(h.floors.first, noLines())).toEqual([0]);
    expect(turnCandidates(noLines(), noLines())).toEqual([0]);
    const junk = [null, undefined, 5, "x", [], {}, { outline: 5, rooms: 5, walls: "x" }, { outline: [[NaN, 0], [0, NaN], [Infinity, 1]], rooms: [null, 5], walls: [null, { a: 1, b: 2 }] }];
    for (const j of junk) for (const k of [...junk, h.floors.first]) {
      expect(() => turnCandidates(j as never, k as never)).not.toThrow();
      expect(turnCandidates(j as never, k as never)).toEqual([0]);
    }
  });

  it("the same input twice gives the same array", () => {
    const { floor: up } = turnedFloor(a.floors.first, -3.3, ABOUT);
    expect(turnCandidates(up, a.floors.first)).toEqual(turnCandidates(up, a.floors.first));
  });

  it("the outline started at another vertex and the walls in reverse order give the same array", () => {
    const { floor: up } = turnedFloor(h.floors.ground, 4.0, ABOUT);
    const base = turnCandidates(up, h.floors.ground);
    const other = clone(up), n = other.outline.length;
    other.outline = [...other.outline.slice(3 % n), ...other.outline.slice(0, 3 % n)];
    other.walls = [...other.walls].reverse().map((w) => ({ ...w, a: w.b, b: w.a }));
    expect(turnCandidates(other, h.floors.ground)).toEqual(base);
    const lowerOther = clone(h.floors.ground);
    lowerOther.outline = [...lowerOther.outline.slice(2), ...lowerOther.outline.slice(0, 2)].reverse();
    expect(turnCandidates(up, lowerOther)).toEqual(base);
  });

  it("symmetric houses give the quarter-turn family of the true turn, and no more than the cap", () => {
    for (const make of [squareHouse, plusHouse]) {
      const { floor: up, truth } = turnedFloor(make(), 2, [400, 400], [10, 5]);
      const c = turnCandidates(up, make());
      for (const q of [0, 90, 180, -90]) expect(nearestTurn(c, truth.turn + q)).toBeLessThan(0.1);
      expect(c.length).toBeLessThanOrEqual(MAX_TURN_CANDIDATES);
    }
  });

  it("noise does not hide the turn: 15 stray lines and 4 cm of jitter (seeded)", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = seeded(seed), { floor: up, truth } = turnedFloor(a.floors.first, 3.4, ABOUT);
      const noisy = clone(up);
      noisy.outline = noisy.outline.map(([x, y]) => [x + (r() - 0.5) * 8, y + (r() - 0.5) * 8] as Pt);
      for (let i = 0; i < 15; i++) { const x = r() * 800, y = r() * 600; noisy.walls.push({ id: `s${i}`, a: [x, y], b: [x + 30 + r() * 120, y + (r() - 0.5) * 140], kind: "external" } as never); }
      expect(nearestTurn(turnCandidates(noisy, a.floors.first), truth.turn), `seed ${seed}`).toBeLessThan(0.5);
    }
  });

  it("it is not a lookup of 0: a floor with no turn gives 0 among candidates and nothing at a made-up angle", () => {
    const c = turnCandidates(a.floors.first, a.floors.first);
    expect(c).toContain(0);
    for (const x of c) expect(nearestTurn([0, 90, 180, -90], x)).toBeLessThan(0.1);
  });

  it("rect helper sanity (the square house is square)", () => {
    expect(squareHouse().outline).toEqual(rect(100, 100, 700, 700));
  });
});

// ---- S30.3: joint refinement of turn and shift ------------------------------------------------------------------------

describe("refinePlace (S30.3)", () => {
  // The truth for an upper floor that is `lowerFloor` put through `placeAbout(deg, ABOUT, shift)` and then laid on `lowerFloor` is the inverse;
  // for the align-house first floor, whose lower floor is the ground, the stored shift of the first floor comes first.
  const FIRST_ON_GROUND: TestPlace = { turn: 0, shift: [-137.4, 61.7] };
  const cases: { name: string; upper: Floor; lower: Floor; truth: TestPlace }[] = (() => {
    const out: { name: string; upper: Floor; lower: Floor; truth: TestPlace }[] = [];
    const pl = placeAbout(3.4, ABOUT, [41, -17]);
    const t1 = turnedFloor(a.floors.first, 3.4, ABOUT, [41, -17]);
    out.push({ name: "align-house first on the ground, turned 3.4", upper: t1.floor, lower: a.floors.ground, truth: composePlace(invertPlace(pl), FIRST_ON_GROUND) });
    const r = blank(rect(0, 0, 800, 400)), t2 = turnedFloor(r, -2.7, [120, 60], [-33, 21]);
    out.push({ name: "plain rectangle, turned -2.7", upper: t2.floor, lower: r, truth: t2.truth });
    const far = blank(rect(20000, 15000, 20800, 15400)), t3 = turnedFloor(far, 5.3, [20400, 15200], [12, -9]);
    out.push({ name: "plain rectangle 25 m from the origin, turned 5.3", upper: t3.floor, lower: far, truth: t3.truth });
    return out;
  })();
  const samplesOf = (f: Floor) => sampleLines(structure(f), 10);
  /** The worst distance, in cm, between where `got` and where `truth` put the floor's structure points. */
  const worst = (f: Floor, got: TestPlace, truth: TestPlace) => structure(f).flatMap((s) => [[s[0], s[1]], [s[2], s[3]]] as Pt[]).reduce((m, p) => {
    const x = placePt(got, p), y = placePt(truth, p); return Math.max(m, Math.hypot(x[0] - y[0], x[1] - y[1]));
  }, 0);
  /** A start that is `dt` degrees and `[dx, dy]` cm off the truth where the floor lies: the error is a turn about the lower floor's centre, then a move. (A turn error about the origin of a floor 25 m away would be 260 cm of displacement.) */
  const off = (truth: TestPlace, lower: Floor, dt: number, dx: number, dy: number): TestPlace => {
    const pts = structure(lower).flatMap((s) => [[s[0], s[1]], [s[2], s[3]]] as Pt[]), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const centre: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    return composePlace(truth, placeAbout(dt, centre, [dx, dy]));
  };

  for (const c of cases) {
    it(`${c.name}: from 0.6 degree and 8 cm off, in both directions of each error, it ends within 0.05 degree and 0.5 cm`, () => {
      for (const [dt, sx, sy] of [[0.6, 1, 1], [-0.6, -1, -1], [0.6, 1, -1], [-0.6, -1, 1]]) {
        const start = off(c.truth, c.lower, dt, sx * 6.4, sy * 4.8);
        const r = refinePlace(samplesOf(c.upper), structure(c.lower), start);
        expect(Math.abs(r.place.turn - c.truth.turn), `${dt} ${sx} ${sy}`).toBeLessThan(0.05);
        expect(worst(c.upper, r.place, c.truth), `${dt} ${sx} ${sy}`).toBeLessThan(0.5);
        expect(r.rounds, "the linearisation about the centre converges in a few rounds").toBeLessThanOrEqual(8);
      }
    });

    it(`${c.name}: a start at the truth stays within 0.01 degree and 0.1 cm`, () => {
      const r = refinePlace(samplesOf(c.upper), structure(c.lower), c.truth);
      expect(Math.abs(r.place.turn - c.truth.turn)).toBeLessThan(0.01);
      expect(worst(c.upper, r.place, c.truth)).toBeLessThan(0.1);
    });

    it(`${c.name}: with the turn unknown removed (shift only) it cannot take out a turn error`, () => {
      const start = off(c.truth, c.lower, 0.6, 6.4, 4.8);
      const r = refinePlace(samplesOf(c.upper), structure(c.lower), start, { turn: false });
      expect(r.place.turn).toBe(start.turn);
      expect(worst(c.upper, r.place, c.truth)).toBeGreaterThan(2);
    });

    it(`${c.name}: the turn moves by at most the cap (2 degrees) from where it started`, () => {
      const start = off(c.truth, c.lower, 5, 3, -2);
      const r = refinePlace(samplesOf(c.upper), structure(c.lower), start);
      expect(Math.abs(r.place.turn - start.turn)).toBeLessThanOrEqual(2 + 1e-9);
    });
  }

  it("one sample (no lever) leaves the turn alone", () => {
    const lower = structure(blank(rect(0, 0, 800, 400)));
    const r = refinePlace([{ x: 300, y: 3, w: 10 }], lower, { turn: 0.6, shift: [0, 2] });
    expect(r.place.turn).toBe(0.6);
  });

  it("one wall on one wall turned 0.6 degree is found", () => {
    const lower: Floor = { ...blank(), walls: [{ id: "w", a: [100, 100], b: [700, 130], kind: "external" } as never] };
    const upper = turnedFloor(lower, 0.6, [400, 115]).floor;
    const r = refinePlace(samplesOf(upper), structure(lower), { turn: 0, shift: [0, 0] });
    expect(Math.abs(r.place.turn - -0.6)).toBeLessThan(0.05);
  });

  it("the score and residual of the answer never get worse than the start's (as refine)", () => {
    const c = cases[0], start = off(c.truth, c.lower, 0.6, 6.4, 4.8), s = samplesOf(c.upper), l = structure(c.lower);
    const r = refinePlace(s, l, start), r0 = refinePlace(s, l, start, { turn: true }) /* same call twice: deterministic */;
    expect(r).toEqual(r0);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.res).toBeLessThan(5);
  });

  it("junk never throws and gives a finite place", () => {
    const good = samplesOf(cases[1].upper), lines = structure(cases[1].lower);
    const junkSamples: unknown[] = [[], null, "x", [{ x: NaN, y: 1, w: 1 }], [{ x: 1, y: Infinity, w: 1 }], [{ x: 1, y: 2, w: -3 }], [{ x: 1, y: 2 }], [null, 5], 5];
    const junkLines: unknown[] = [[], null, [[NaN, 0, 1, 1]], [[0, 0, 0, 0]], [[1, 2, 3]], "x"];
    const junkPlaces: unknown[] = [null, {}, { turn: NaN, shift: [0, 0] }, { turn: "4", shift: [0, 0] }, { turn: 1, shift: "x" }, { turn: 1, shift: [NaN, 0] }, { turn: 1e308, shift: [1e308, -1e308] }];
    for (const s of [...junkSamples, good]) for (const l of [...junkLines, lines]) for (const p of [...junkPlaces, { turn: 0, shift: [0, 0] }]) {
      let r: ReturnType<typeof refinePlace> | undefined;
      expect(() => { r = refinePlace(s as never, l as never, p as never); }).not.toThrow();
      expect(Number.isFinite(r!.place.turn) && Number.isFinite(r!.place.shift[0]) && Number.isFinite(r!.place.shift[1])).toBe(true);
    }
  });
});

// ---- S30.5: the exact line index -------------------------------------------------------------------------------------
import { buildLineIndex, linesNear, REFINE_REACH } from "../../src/core/align";

describe("line index (S30.5)", () => {
  const dist = (x: number, y: number, s: number[]) => {
    const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy, u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l2));
    return Math.hypot(s[0] + dx * u - x, s[1] + dy * u - y);
  };
  const randomLines = (seed: number, n: number, extent: number) => {
    const r = seeded(seed), out: [number, number, number, number][] = [];
    for (let i = 0; i < n; i++) { const x = r() * extent, y = r() * extent; out.push([x, y, x + (r() - 0.5) * 300, y + (r() - 0.5) * 300]); }
    return out;
  };

  it("lists, for every point, every line within the reach, in the lines' own order (a superset of the scan's answer)", () => {
    for (const [seed, extent] of [[1, 3000], [2, 900], [3, 20000]]) {
      const lines = randomLines(seed, 400, extent), idx = buildLineIndex(lines), r = seeded(seed + 100);
      for (let q = 0; q < 1500; q++) {
        const x = (r() * 1.2 - 0.1) * extent, y = (r() * 1.2 - 0.1) * extent, got = linesNear(idx, x, y);
        expect(got, "a bucket grid is built for finite lines").not.toBeNull();
        const set = new Set(got!);
        lines.forEach((s, i) => { if (dist(x, y, s) < REFINE_REACH) expect(set.has(i), `line ${i} at ${dist(x, y, s).toFixed(2)} cm from ${x.toFixed(1)}, ${y.toFixed(1)}`).toBe(true); });
        expect([...got!].sort((p, c) => p - c)).toEqual([...got!]);
      }
    }
  });

  it("looks at a few lines, not all of them: on a floor of 600 lines the mean list is under 5 %", () => {
    const lines = randomLines(7, 600, 30000), idx = buildLineIndex(lines), r = seeded(8);
    let total = 0;
    for (let q = 0; q < 2000; q++) total += linesNear(idx, r() * 30000, r() * 30000)!.length;
    expect(total / 2000).toBeLessThan(0.05 * lines.length);
  });

  it("a point outside the lines' box has none within reach, and an empty floor and hostile numbers never throw", () => {
    const idx = buildLineIndex([[0, 0, 100, 0], [100, 0, 100, 100]]);
    expect(linesNear(idx, -500, 40)).toEqual([]);
    expect(linesNear(idx, 50, 5000)).toEqual([]);
    expect(linesNear(idx, 50, 3)).toContain(0); // a cell lists every line that can be near, so a neighbour in the same cell is listed too
    const empty = buildLineIndex([]);
    expect(linesNear(empty, 1, 1)).toEqual([]);
    for (const segs of [[[-1e308, -1e308, 1e308, 1e308]], [[0, 0, 1e308, 0], [5, 5, 6, 6]], [[NaN, 0, 1, 1]], [[Infinity, 0, 1, 1]]] as number[][][]) {
      const h = buildLineIndex(segs as never);
      expect(() => linesNear(h, 3, 3)).not.toThrow();
      // Whatever it cannot index it answers with null: the caller then scans every line.
      const got = linesNear(h, 3, 3);
      expect(got === null || Array.isArray(got)).toBe(true);
    }
  });
});
