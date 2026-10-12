// S30.5: the cases whose answers were recorded from the 0.27.0 scan (before the line index), in `align-golden.json`. The index must
// give the same answers bit for bit, so the test compares with deep equality. The cases are built here from the invented fixtures only.
import demo from "../../demo/layout.json";
import stress from "./stress-layout.json";
import house from "./align-house.json";
import hand from "./hand-align-house.json";
import { blank, rect, turnedFloor, seeded, starFloor, placeAbout, composePlace } from "./align-turn";
import type { Floor, Layout, Pt } from "../../src/core/schema";

export interface GoldenCase { name: string; upper: Floor; lower: Floor; turn: number }

const H = hand as unknown as Layout, A = house as unknown as Layout, D = demo as unknown as Layout, S = stress as unknown as Layout;
const ABOUT: Pt = [370, -120];

/** The stress layout's ground and first floor with the 300 short external walls of `align-mode.spec.ts` on them: the heavy floor of the field report. */
export function heavyStress(): Layout {
  const lay = structuredClone(S);
  for (const key of ["ground", "first"]) {
    const f = lay.floors[key];
    for (let i = 0; i < 300; i++) { const x = (i % 30) * 60 + (key === "first" ? 7 : 0), y = Math.floor(i / 30) * 90 + 3 * (i % 7); f.walls.push({ a: [x, y], b: [x + 50, y + 11 + (i % 5)], kind: "external" } as never); }
  }
  return lay;
}

/** A circle of `n` points and radius 5000, the 10 000-point outline of the budget test. */
export const circle = (n = 10000, dx = 0, dy = 0): Pt[] => Array.from({ length: n }, (_, i) => [Math.round(5000 * Math.cos((i / n) * 2 * Math.PI)) + dx, Math.round(5000 * Math.sin((i / n) * 2 * Math.PI)) + dy] as Pt);

const centreOf = (f: Floor): Pt => {
  const xs = f.outline.map((p) => p[0]), ys = f.outline.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

export function shiftCases(): GoldenCase[] {
  const out: GoldenCase[] = [];
  const add = (name: string, upper: Floor, lower: Floor, turns: number[]) => { for (const t of turns) out.push({ name: `${name} @${t}`, upper, lower, turn: t }); };
  const TURNS = [0, 4, -2.5, 7.3, -176];
  add("hand first/ground", H.floors.first, H.floors.ground, TURNS);
  add("hand ground/basement", H.floors.ground, H.floors.basement, TURNS);
  add("hand first/basement", H.floors.first, H.floors.basement, [0, 4]);
  add("align-house first/ground", A.floors.first, A.floors.ground, TURNS);
  add("align-house ground/first", A.floors.ground, A.floors.first, [0, 93]);
  add("demo first/ground", D.floors.first, D.floors.ground, [0, 180]);
  const keys = Object.keys(S.floors);
  for (let i = 1; i < keys.length; i++) {
    const u = S.floors[keys[i]], l = S.floors[keys[i - 1]];
    add(`stress ${keys[i]}/${keys[i - 1]}`, u, l, [0, 7.3, -7.3]);
    add(`stress ${keys[i]}/${keys[i - 1]} turned 7.30`, turnedFloor(u, 7.3, centreOf(u)).floor, l, [0, -7.3]);
  }
  const hv = heavyStress();
  add("heavy first/ground", hv.floors.first, hv.floors.ground, [0, 4]);
  add("circle 10000", blank(circle()), blank(circle(10000, 40, -25)), [0]);
  // turned copies about [370, -120]
  for (const [name, f] of [["hand first", H.floors.first], ["hand ground", H.floors.ground], ["align-house first", A.floors.first], ["align-house ground", A.floors.ground]] as [string, Floor][])
    for (const deg of [-9.7, 3.3, 23, 93]) add(`${name} turned ${deg} on itself`, turnedFloor(f, deg, ABOUT, [41, -17]).floor, f, [0, -deg]);
  // 0.27.0's seeded corner rectangles
  const r = seeded(12345);
  for (let n = 0; n < 200; n++) {
    const W = 600 + r() * 1000, Hh = 300 + r() * 500, w = W * (0.3 + r() * 0.5), h = Hh * (0.3 + r() * 0.5), ox = r() * 40, oy = r() * 40;
    const corner = n % 4, left = corner % 2 === 0, top = corner < 2, x0 = left ? ox : W - ox - w, y0 = top ? oy : Hh - oy - h;
    add(`corner rect ${n}`, blank(rect(x0, y0, x0 + w, y0 + h)), blank(rect(0, 0, W, Hh)), [0]);
  }
  // unrelated seeded stars, a plain rectangle that is a few cm off, one far from the origin
  for (let seed = 1; seed <= 20; seed++) { const g = seeded(seed * 7919); add(`stars ${seed}`, starFloor(g), starFloor(g), [0]); }
  for (const [dx, dy] of [[8, 0], [0, -8], [-5.6, 5.6], [1.5, 0], [3, 3]]) add(`rect off ${dx},${dy}`, blank(rect(dx, dy, 800 + dx, 400 + dy)), blank(rect(0, 0, 800, 400)), [0]);
  add("far L", turnedFloor(blank([[1e7 - 900, 1e7 - 700], [1e7 - 100, 1e7 - 700], [1e7 - 100, 1e7 - 300], [1e7 - 500, 1e7 - 300], [1e7 - 500, 1e7 + 100], [1e7 - 900, 1e7 + 100]]), 3.37, [1e7 - 500, 1e7 - 300]).floor, blank([[1e7 - 900, 1e7 - 700], [1e7 - 100, 1e7 - 700], [1e7 - 100, 1e7 - 300], [1e7 - 500, 1e7 - 300], [1e7 - 500, 1e7 + 100], [1e7 - 900, 1e7 + 100]]), [0, -3.37]);
  return out;
}

export interface PlaceCase { name: string; upper: Floor; lower: Floor; place: { turn: number; shift: Pt }; turnFree: boolean }

/** Starts for `refinePlace`: each pair from a place a little off its truth, with the turn free and held. */
export function placeCases(): PlaceCase[] {
  const out: PlaceCase[] = [];
  const pairs: [string, Floor, Floor, number, Pt][] = [
    ["hand first/ground", H.floors.first, H.floors.ground, 4, [83, -41]],
    ["hand ground/basement", H.floors.ground, H.floors.basement, -2.5, [-57, 112]],
    ["align-house first/ground", A.floors.first, A.floors.ground, 0, [-137.4, 61.7]],
    ["demo first/ground", D.floors.first, D.floors.ground, 0, [0, 0]],
  ];
  for (const [name, u, l, turn, shift] of pairs) for (const [dt, dx, dy] of [[0, 0, 0], [0.6, 6.4, 4.8], [-0.6, -6.4, 4.8], [1.3, -3, 9], [-2.4, 2, -2]]) for (const free of [true, false])
    out.push({ name: `${name} +${dt},${dx},${dy} ${free ? "free" : "held"}`, upper: u, lower: l, place: composePlace({ turn, shift }, placeAbout(dt, [400, 300], [dx, dy])), turnFree: free });
  return out;
}
