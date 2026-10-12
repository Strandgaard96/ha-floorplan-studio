// Sprint 30 (0.28.0): Align searches the turn. S30.2 here: candidate turns from direction histograms.
import { describe, it, expect } from "vitest";
import hand from "../fixtures/hand-align-house.json";
import house from "../fixtures/align-house.json";
import { turnCandidates, refinePlace, sampleLines, structure, MAX_TURN_CANDIDATES, buildLineIndex, linesNear, REFINE_REACH, alignFloor, alignShift, alignCandidates, chooseAlign, WEAK_BELOW, type AlignFit } from "../../src/core/align";
import { blank, rect, turnedFloor, nearestTurn, squareHouse, plusHouse, noLines, seeded, starFloor, cornerError, composePlace, placeAbout, invertPlace, placePt, type TestPlace } from "../fixtures/align-turn";
import { FIRST_TO_GROUND, GROUND_TO_BASEMENT } from "../fixtures/hand-align-truth";
import { circle, heavyStress } from "../fixtures/align-golden";
import stress from "../fixtures/stress-layout.json";
import demo from "../../demo/layout.json";
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

// ---- S30.4: alignFloor searches the turn ------------------------------------------------------------------------------------

const ends = (f: Floor): Pt[] => structure(f).flatMap((s) => [[s[0], s[1]], [s[2], s[3]]] as Pt[]);
/** The angle between two turns, 0 to 180. */
const gap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const asPlace = (r: { turn: number; t: Pt }): TestPlace => ({ turn: r.turn, shift: r.t });

describe("alignFloor searches the turn (S30.4)", () => {
  /** A turned copy of `f` laid on `f`: the truth is the inverse of how it was turned. */
  const onItself = (f: Floor, deg: number) => { const { floor: up, truth } = turnedFloor(f, deg, ABOUT, [41, -17]); return { up, truth, r: alignFloor(up, f) }; };

  it("the hand-align first floor from the identity: the truth within 0.2 degree and 2 cm, not weak, alt names the half turn", () => {
    for (const [name, up, low, truth] of [["first", h.floors.first, h.floors.ground, FIRST_TO_GROUND], ["ground", h.floors.ground, h.floors.basement, GROUND_TO_BASEMENT]] as const) {
      const r = alignFloor(up, low)!;
      expect(r, name).not.toBeNull();
      expect(gap(r.turn, truth.turn), name).toBeLessThan(0.2);
      expect(cornerError(ends(up), asPlace(r), truth), name).toBeLessThan(2);
      expect(r.weak, name).toBe(false);
      expect(r.alt, name).not.toBeNull();
      expect(gap(r.alt!.turn, truth.turn + 180), `${name}: alt ${r.alt!.turn}`).toBeLessThan(1);
    }
  });

  for (const [name, f] of [["align-house first (the rectangle)", a.floors.first], ["hand first", h.floors.first], ["hand ground", h.floors.ground], ["align-house ground (the L)", a.floors.ground]] as [string, Floor][]) {
    it(`${name}: turned either way by each small test angle, from 0: within 0.2 degree and 2 cm at every corner`, () => {
      for (const deg of TURNS.filter((t) => Math.abs(t) < 20)) for (const sign of [1, -1]) {
        const { up, truth, r } = onItself(f, deg * sign);
        expect(r, `${deg * sign}`).not.toBeNull();
        expect(gap(r!.turn, truth.turn), `${name} turned ${deg * sign}: got ${r!.turn}`).toBeLessThan(0.2);
        expect(cornerError(ends(up), asPlace(r!), truth), `${name} turned ${deg * sign}`).toBeLessThan(2);
      }
    });
  }

  it("the align-house L over a copy of itself is found at 23, -31 and 93 degrees, either way (the far tier wins by its margin)", () => {
    for (const deg of [23, -31, 93, -23, 31, -93]) {
      const { up, truth, r } = onItself(a.floors.ground, deg);
      expect(gap(r!.turn, truth.turn), `turned ${deg}: got ${r!.turn}`).toBeLessThan(0.2);
      expect(cornerError(ends(up), asPlace(r!), truth), `turned ${deg}`).toBeLessThan(2);
    }
  });

  it("the align-house rectangle at plus or minus 93 gives the truth or its half-turn twin, and alt names the other", () => {
    for (const deg of [93, -93]) {
      const { truth, r } = onItself(a.floors.first, deg);
      const toTruth = gap(r!.turn, truth.turn), toTwin = gap(r!.turn, truth.turn + 180);
      expect(Math.min(toTruth, toTwin), `turned ${deg}: got ${r!.turn}`).toBeLessThan(0.2);
      expect(r!.alt, `turned ${deg}`).not.toBeNull();
      expect(gap(r!.alt!.turn, toTruth < toTwin ? truth.turn + 180 : truth.turn), `turned ${deg}: alt ${r!.alt!.turn}`).toBeLessThan(1);
    }
  });

  it("the hand-align floors at 23 and -31 are found; at plus or minus 93 found, or the twin or near 0 with alt naming the truth (never confident and wrong)", () => {
    for (const f of [h.floors.first, h.floors.ground]) for (const deg of [23, -23, -31, 31]) {
      const { up, truth, r } = onItself(f, deg);
      expect(gap(r!.turn, truth.turn), `turned ${deg}: got ${r!.turn}`).toBeLessThan(0.2);
      expect(cornerError(ends(up), asPlace(r!), truth)).toBeLessThan(2);
    }
    for (const f of [h.floors.first, h.floors.ground]) for (const deg of [93, -93]) {
      const { up, truth, r } = onItself(f, deg);
      const found = gap(r!.turn, truth.turn) < 0.2 && cornerError(ends(up), asPlace(r!), truth) < 2;
      if (found) continue;
      // The hand first floor is a rectangle: its half turn scores 100 as well, so the twin may answer. Then alt must name the truth.
      const twin = gap(r!.turn, truth.turn + 180) < 0.2;
      if (!twin) expect(Math.abs(r!.turn), `turned ${deg}: got ${r!.turn}`).toBeLessThanOrEqual(10);
      expect(r!.alt, `turned ${deg}: a confident wrong answer`).not.toBeNull();
      expect(Math.min(gap(r!.alt!.turn, truth.turn), gap(r!.alt!.turn, truth.turn + 180)), `turned ${deg}: alt ${r!.alt!.turn}`).toBeLessThan(1);
    }
  });

  it("from is honoured: the first floor with from 184 gives -176 (within 0.2), with 0 gives 4", () => {
    const at184 = alignFloor(h.floors.first, h.floors.ground, 184)!, at0 = alignFloor(h.floors.first, h.floors.ground, 0)!;
    expect(gap(at184.turn, -176)).toBeLessThan(0.2);
    expect(at184.turn).toBeGreaterThan(-180);
    expect(at184.turn).toBeLessThanOrEqual(180);
    expect(gap(at0.turn, 4)).toBeLessThan(0.2);
    expect(at184.alt && gap(at184.alt.turn, 4) < 1).toBe(true);
  });

  it("a symmetric square house turned 2 degrees: found within 0.2, and never a confident answer", () => {
    for (const make of [squareHouse, plusHouse]) for (const deg of [2, -2, 3.4]) {
      const { floor: up, truth } = turnedFloor(make(), deg, [400, 400], [10, 5]);
      const r = alignFloor(up, make())!;
      expect(gap(r.turn, truth.turn), `turned ${deg}`).toBeLessThan(0.2);
      expect(r.alt, `turned ${deg}`).not.toBeNull();
      expect(r.weak && r.alt === null, "never weak=false with alt=null on a symmetric floor").toBe(false);
      expect(!r.weak && r.alt === null).toBe(false);
    }
  });

  it("noisy but answerable: 3.40 degrees, every point jittered up to 4 cm and 15 stray lines (seeded): within 0.5 degree and 5 cm, scored below the clean one", () => {
    const clean = onItself(a.floors.first, 3.4);
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = seeded(seed), j = () => (rnd() - 0.5) * 8, { floor: up, truth } = turnedFloor(a.floors.first, 3.4, ABOUT, [41, -17]);
      const noisy = clone(up);
      noisy.outline = noisy.outline.map(([x, y]) => [x + j(), y + j()] as Pt);
      noisy.walls = noisy.walls.map((w) => ({ ...w, a: [w.a[0] + j(), w.a[1] + j()] as Pt, b: [w.b[0] + j(), w.b[1] + j()] as Pt }));
      for (let i = 0; i < 15; i++) { const x = rnd() * 1000, y = rnd() * 800; noisy.walls.push({ id: `n${i}`, a: [x, y], b: [x + (rnd() - 0.5) * 400, y + (rnd() - 0.5) * 400], kind: "external" } as never); }
      const r = alignFloor(noisy, a.floors.first)!;
      expect(gap(r.turn, truth.turn), `seed ${seed}: got ${r.turn}`).toBeLessThan(0.5);
      expect(cornerError(ends(up), asPlace(r), truth), `seed ${seed}`).toBeLessThan(5);
      expect(r.score, `seed ${seed}`).toBeLessThan(clean.r!.score);
    }
  });

  it("no answer: two unrelated random star polygons are weak or carry alt, for each of 20 seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = seeded(seed * 7919), r = alignFloor(starFloor(g), starFloor(g))!;
      expect(r, `seed ${seed}`).not.toBeNull();
      expect(r.weak || r.alt !== null, `seed ${seed}: ${JSON.stringify(r)}`).toBe(true);
      // Opus review: a weak answer is not made less weak by an alt that is weak too (two bad guesses are not a choice).
      if (r.weak && r.alt) expect(r.alt.score, `seed ${seed}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(WEAK_BELOW);
    }
  });

  it("the far margin: the 0.27.0 corner rectangles, 2000 seeds, never land turned", () => {
    const rnd = seeded(12345);
    let turned = 0;
    for (let n = 0; n < 2000; n++) {
      const W = 600 + rnd() * 1000, H = 300 + rnd() * 500, w = W * (0.3 + rnd() * 0.5), hh = H * (0.3 + rnd() * 0.5), ox = rnd() * 40, oy = rnd() * 40;
      const corner = n % 4, left = corner % 2 === 0, top = corner < 2, x0 = left ? ox : W - ox - w, y0 = top ? oy : H - oy - hh;
      const r = alignFloor(blank(rect(x0, y0, x0 + w, y0 + hh)), blank(rect(0, 0, W, H)))!;
      if (Math.abs(r.turn) > 0.05) turned++;
    }
    expect(turned).toBe(0);
  });

  it("far from the origin: an L at [1e7 - 900, 1e7 - 700] turned 3.374 about its centre (a turn that rounds to 3.37, moving the origin 700 cm) is found within 0.2 degree and 2 cm", () => {
    const L = blank([[1e7 - 900, 1e7 - 700], [1e7 - 100, 1e7 - 700], [1e7 - 100, 1e7 - 300], [1e7 - 500, 1e7 - 300], [1e7 - 500, 1e7 + 100], [1e7 - 900, 1e7 + 100]]);
    const { floor: up, truth } = turnedFloor(L, 3.374, [1e7 - 500, 1e7 - 300]);
    const r = alignFloor(up, L)!;
    expect(gap(r.turn, truth.turn), `got ${r.turn}`).toBeLessThan(0.2);
    expect(cornerError(ends(up), asPlace(r), truth)).toBeLessThan(2);
  });

  it("a floor with no lines, or a lower floor with none, gives null; junk floors and junk from never throw", () => {
    expect(alignFloor(noLines(), h.floors.first)).toBeNull();
    expect(alignFloor(h.floors.first, noLines())).toBeNull();
    const junk = [null, undefined, 5, "x", [], {}, { outline: 5, rooms: 5, walls: "x" }, { outline: [[NaN, 0], [0, NaN], [Infinity, 1]], rooms: [null, 5], walls: [null, { a: 1, b: 2 }] }];
    for (const j of junk) for (const k of [...junk, h.floors.first]) expect(() => alignFloor(j as never, k as never)).not.toThrow();
    const zero = alignFloor(h.floors.first, h.floors.ground, 0);
    for (const from of [NaN, "4", null, [4], 1e308, Infinity, undefined, {}]) {
      expect(() => alignFloor(h.floors.first, h.floors.ground, from as never), String(from)).not.toThrow();
      expect(alignFloor(h.floors.first, h.floors.ground, from as never), `junk from ${String(from)} reads as 0`).toEqual(zero);
    }
  });

  it("deterministic: twice deep equal; another start vertex, reversed walls and shuffled rooms within 0.01 degree and 0.1 cm; alignCandidates equal whatever from the caller passes later", () => {
    const { floor: up } = turnedFloor(h.floors.ground, -4.6, ABOUT, [12, 30]);
    const first = alignFloor(up, h.floors.basement)!;
    expect(alignFloor(up, h.floors.basement)).toEqual(first);
    const other = clone(up), n = other.outline.length;
    other.outline = [...other.outline.slice(2 % n), ...other.outline.slice(0, 2 % n)].reverse();
    other.rooms = [...other.rooms].reverse();
    other.walls = [...other.walls].reverse().map((w) => ({ ...w, a: w.b, b: w.a }));
    const r = alignFloor(other, h.floors.basement)!;
    expect(Math.abs(r.turn - first.turn)).toBeLessThan(0.01);
    expect(Math.hypot(r.t[0] - first.t[0], r.t[1] - first.t[1])).toBeLessThan(0.1);
    const fits = alignCandidates(up, h.floors.basement), copy = clone(fits);
    for (const from of [0, 184, -30, 77]) { chooseAlign(fits, from); expect(fits).toEqual(copy); }
    expect(alignCandidates(up, h.floors.basement)).toEqual(fits);
  });

  it("the 0.27.0 cases still hold with turn 0: the demo's identical floors give turn 0, [0, 0], 100", () => {
    const l = demo as unknown as Layout, r = alignFloor(l.floors.first, l.floors.ground)!;
    expect(r.turn).toBe(0);
    expect(r.t).toEqual([0, 0]);
    expect(r.score).toBe(100);
    expect(r.weak).toBe(false);
  });
});

describe("alignCandidates (S30.4)", () => {
  it("lists a fit for each searched turn, sorted by turn, merged within 2 degrees, each with a finite turn, t, score and residual", () => {
    const fits = alignCandidates(h.floors.first, h.floors.ground)!;
    expect(fits.length).toBeGreaterThanOrEqual(2);
    expect([...fits].sort((p, q) => p.turn - q.turn)).toEqual(fits);
    for (let i = 1; i < fits.length; i++) expect(gap(fits[i].turn, fits[i - 1].turn)).toBeGreaterThan(2);
    for (const f of fits) { expect([f.turn, f.t[0], f.t[1], f.score, f.res].every(Number.isFinite)).toBe(true); expect(f.turn).toBeGreaterThan(-180); expect(f.turn).toBeLessThanOrEqual(180); }
    expect(fits.some((f) => gap(f.turn, 4) < 0.2)).toBe(true);
    expect(fits.some((f) => gap(f.turn, -176) < 0.2)).toBe(true);
  });
  it("null when either floor has no line, and never throws on junk", () => {
    expect(alignCandidates(noLines(), h.floors.first)).toBeNull();
    expect(alignCandidates(h.floors.first, noLines())).toBeNull();
    for (const j of [null, 5, "x", {}, { outline: [[NaN, 0]] }]) expect(() => alignCandidates(j as never, h.floors.first)).not.toThrow();
  });
});

describe("chooseAlign (S30.4): the small tier, the far tier, ties and alt", () => {
  const fit = (turn: number, score: number, t: Pt = [0, 0], res = 5): AlignFit => ({ turn, t, score, res });
  it("a far fit wins only by 25 points and not weak; below that the small tier answers and alt names the far fit", () => {
    expect(chooseAlign([fit(4, 60), fit(-176, 84.9)], 0)).toMatchObject({ turn: 4, score: 60, weak: false, alt: { turn: -176, score: 84.9 } });
    expect(chooseAlign([fit(4, 60), fit(-176, 85)], 0)).toMatchObject({ turn: -176, score: 85, alt: null });
    expect(chooseAlign([fit(4, 60), fit(-176, 85)], 180)).toMatchObject({ turn: -176 });
  });
  it("a weak far fit never wins by margin, and a small answer that is weak says so", () => {
    const r = chooseAlign([fit(4, 10), fit(120, 45)], 0)!;
    expect(r).toMatchObject({ turn: 4, score: 10, weak: true, alt: null }); // Opus review: 45 is weak too, so it is no alt
    // ... but a weak answer with an alt that is not weak keeps it: the far fit is the better lead.
    expect(chooseAlign([fit(4, 40), fit(-100, 60)], 0)).toMatchObject({ turn: 4, score: 40, weak: true, alt: { turn: -100, score: 60 } });
    expect(chooseAlign([fit(4, 40), fit(-100, 50)], 0)!.alt).toEqual({ turn: -100, score: 50 });
    expect(chooseAlign([fit(4, 40), fit(-100, 49.9)], 0)!.alt).toBeNull();
  });
  it("small tier is within 10 degrees of from, the circle wrapped: from 184 reads -176 as near", () => {
    expect(chooseAlign([fit(-176, 70), fit(4, 90)], 184)).toMatchObject({ turn: -176, alt: { turn: 4, score: 90 } });
    expect(chooseAlign([fit(179, 70), fit(-175, 72)], 0)).not.toBeNull();
  });
  it("a tie within 1 point goes to the turn nearer from, then the smaller move, then the smaller residual, then the smaller turn", () => {
    expect(chooseAlign([fit(8, 80.5), fit(1, 80)], 0)).toMatchObject({ turn: 1 });
    expect(chooseAlign([fit(5, 80, [30, 40]), fit(-5, 80, [3, 4])], 0)).toMatchObject({ turn: -5 });
    expect(chooseAlign([fit(5, 80, [3, 4], 6), fit(-5, 80, [3, 4], 2)], 0)).toMatchObject({ turn: -5 });
    expect(chooseAlign([fit(5, 80, [3, 4], 2), fit(-5, 80, [3, 4], 2)], 0)).toMatchObject({ turn: -5 });
    expect(chooseAlign([fit(5, 80, [3, 4], 2), fit(-5, 80, [3, 4], 2)].reverse(), 0)).toMatchObject({ turn: -5 });
    expect(chooseAlign([fit(1, 70), fit(2.5, 90)], 0)).toMatchObject({ turn: 2.5 });
  });
  it("alt is the best other fit more than 2 degrees away within 5 points, even when it scores higher; none when nothing is near", () => {
    expect(chooseAlign([fit(1, 70), fit(5, 74), fit(-176, 30)], 0)).toMatchObject({ turn: 5, alt: null }.turn === 5 ? { alt: { turn: 1, score: 70 } } : {});
    expect(chooseAlign([fit(1, 70), fit(-176, 30)], 0)!.alt).toBeNull();
    expect(chooseAlign([fit(4, 60), fit(-176, 84)], 0)!.alt).toEqual({ turn: -176, score: 84 });
  });
  it("the result: turn in (-180, 180], weak under 50, null for no fits, junk from reads as 0", () => {
    expect(chooseAlign([], 0)).toBeNull();
    expect(chooseAlign(null as never, 0)).toBeNull();
    expect(chooseAlign([fit(49, 49.9)], 40)).toMatchObject({ weak: true });
    expect(chooseAlign([fit(180, 60)], "x" as never)!.turn).toBe(180);
    expect(chooseAlign([fit(3, 60), fit(180, 60)], NaN as never)).toEqual(chooseAlign([fit(3, 60), fit(180, 60)], 0));
  });
});

// ---- S30.5: the time budget (the slower of two runs counts) --------------------------------------------------------------------

describe("time budget (S30.5)", () => {
  const slower = (f: () => unknown) => { let worst = 0; for (let i = 0; i < 2; i++) { const t0 = performance.now(); f(); worst = Math.max(worst, performance.now() - t0); } return worst; };
  const S = stress as unknown as Layout, keys = Object.keys(S.floors);
  const centre = (f: Floor): Pt => { const p = ends(f), xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };

  it("each consecutive floor pair of the stress layout, as stored and with the upper floor turned 7.30 degrees about its centre: under 600 ms", () => {
    for (let i = 1; i < keys.length; i++) {
      const up = S.floors[keys[i]], low = S.floors[keys[i - 1]];
      expect(slower(() => alignFloor(up, low)), `${keys[i]} as stored`).toBeLessThan(600);
      const turned = turnedFloor(up, 7.3, centre(up)).floor;
      expect(slower(() => alignFloor(turned, low)), `${keys[i]} turned`).toBeLessThan(600);
    }
  });

  it("the stress first floor with 300 short external walls on it and on the ground: under 600 ms", () => {
    const hv = heavyStress();
    expect(slower(() => alignFloor(hv.floors.first, hv.floors.ground))).toBeLessThan(600);
  });

  it("a 10 000-point circle, in 8000 ms", () => {
    const up = blank(circle()), low = blank(circle(10000, 40, -25));
    expect(slower(() => alignFloor(up, low))).toBeLessThan(8000);
  });

  it("alignShift on the stress pair stays under 200 ms", () => {
    expect(slower(() => alignShift(S.floors[keys[1]], S.floors[keys[0]]))).toBeLessThan(200);
  });
});

describe("Opus review: chooseAlign never throws", () => {
  const fit = (turn: number, score: number): AlignFit => ({ turn, t: [0, 0], score, res: 5 });
  it("junk entries are dropped, and a list of only junk gives null", () => {
    for (const junk of [[null], [{}], [undefined], [5, "x"], [{ turn: NaN, t: [0, 0], score: 50, res: 1 }], [{ turn: 0, t: null, score: 50, res: 1 }], [{ turn: 0, t: [0, NaN], score: 50, res: 1 }]]) {
      expect(() => chooseAlign(junk as never, 0), JSON.stringify(junk)).not.toThrow();
      expect(chooseAlign(junk as never, 0), JSON.stringify(junk)).toBeNull();
    }
  });
  it("a good fit beside junk is still the answer, and the junk is never its alt", () => {
    const r = chooseAlign([null, { turn: NaN, t: [0, 0], score: 99, res: 1 }, fit(3, 70)] as never, 0)!;
    expect(r).toMatchObject({ turn: 3, score: 70, alt: null });
  });
});

// ---- Opus review of Sprint 30: short lines, the alt of a weak answer, junk fits -----------------------------------------------

describe("Opus review: short lines vote (HIST_MIN_LEN 0)", () => {
  const L: Pt[] = [[0, 0], [900, 0], [900, 400], [500, 400], [500, 700], [0, 700]];
  /** The outline cut into pieces of at most `step` cm: a drawing tool that clicks every 15 cm makes this. */
  const cut = (c: Pt[], step: number): Pt[] => c.flatMap((a, i) => {
    const b = c[(i + 1) % c.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as Pt);
  });
  for (const step of [15, 19]) for (const deg of [7.3, 4]) for (const which of ["both", "lower only"]) {
    it(`an L cut into ${step} cm pieces, turned ${deg}, ${which} cut: found within 0.2 degree and 2 cm`, () => {
      const low = blank(cut(L, step)), up = turnedFloor(blank(which === "both" ? cut(L, step) : L), deg, ABOUT);
      const r = alignFloor(up.floor, low)!;
      expect(r, "an answer").not.toBeNull();
      expect(gap(r.turn, up.truth.turn), `got ${r.turn}`).toBeLessThan(0.2);
      expect(cornerError(ends(up.floor), asPlace(r), up.truth)).toBeLessThan(2);
    });
  }
});
