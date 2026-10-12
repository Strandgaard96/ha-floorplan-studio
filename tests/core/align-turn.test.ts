// Sprint 30 (0.28.0): Align searches the turn. S30.2 here: candidate turns from direction histograms.
import { describe, it, expect } from "vitest";
import hand from "../fixtures/hand-align-house.json";
import house from "../fixtures/align-house.json";
import { turnCandidates, MAX_TURN_CANDIDATES } from "../../src/core/align";
import { blank, rect, turnedFloor, nearestTurn, squareHouse, plusHouse, noLines, seeded } from "../fixtures/align-turn";
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
