// S30.2: shapes and helpers for the turn search. Every number is invented; no part of a real house is here.
import type { Floor, Pt } from "../../src/core/schema";

/** A place is `p' = R(turn) · p + shift`, turn in degrees clockwise on screen (y points down), as `Place` in core. */
export interface TestPlace { turn: number; shift: Pt }

export const blank = (outline: Pt[] = []): Floor => ({
  title: "T", outline, rooms: [], walls: [], stairs: [], doors: [], openings: [], extras: [], devices: [], furniture: [], unlinked: [],
});
export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const turnPt = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
export const placePt = (pl: TestPlace, p: Pt): Pt => { const r = turnPt(p, pl.turn); return [r[0] + pl.shift[0], r[1] + pl.shift[1]]; };
export const invertPlace = (pl: TestPlace): TestPlace => { const s = turnPt(pl.shift, -pl.turn); return { turn: -pl.turn, shift: [-s[0], -s[1]] }; };

/** A place that turns by `deg` about the point `about` and then moves by `shift`. */
export const placeAbout = (deg: number, about: Pt, shift: Pt = [0, 0]): TestPlace => {
  const r = turnPt(about, deg);
  return { turn: deg, shift: [about[0] - r[0] + shift[0], about[1] - r[1] + shift[1]] };
};

/**
 * `floor` with every structure point (outline, walls, rooms, stairs and their openings) put through `placeAbout(deg, about, shift)`.
 * Returns the moved floor and `truth`: the place that lays it back on `floor`, which is what Align should find
 * (`turn` -deg). A stair's own `rot` turns with it.
 */
export function turnedFloor(floor: Floor, deg: number, about: Pt = [0, 0], shift: Pt = [0, 0]): { floor: Floor; truth: TestPlace } {
  const pl = placeAbout(deg, about, shift), T = (p: Pt): Pt => placePt(pl, p);
  const f = structuredClone(floor) as Floor;
  f.outline = f.outline.map(T);
  f.walls = f.walls.map((w) => ({ ...w, a: T(w.a), b: T(w.b) }));
  f.rooms = f.rooms.map((r) => ({ ...r, pts: r.pts.map(T) }));
  f.stairs = f.stairs.map((s) => ({ ...s, pts: s.pts.map(T), rot: (((s.rot + deg) % 360) + 360) % 360 }));
  f.doors = f.doors.map((d) => ({ ...d, a: T(d.a), b: T(d.b) }));
  f.openings = f.openings.map((o) => ({ ...o, a: T(o.a), b: T(o.b) }));
  return { floor: f, truth: invertPlace(pl) };
}

/** A deterministic generator in [0, 1): the same seed gives the same run (the 0.27.0 tests' linear congruence). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A square house, 600 by 600, four-fold symmetric: every quarter turn fits. */
export const squareHouse = (): Floor => blank(rect(100, 100, 700, 700));

/** A plus-shaped house, arms 200 wide and 700 long, centred at [400, 400]: symmetric under a quarter turn. */
export const plusHouse = (): Floor => blank([
  [300, 50], [500, 50], [500, 300], [750, 300], [750, 500], [500, 500],
  [500, 750], [300, 750], [300, 500], [50, 500], [50, 300], [300, 300],
]);

/** A floor with no structure line at all. */
export const noLines = (): Floor => blank();

/** Where a candidate list has `deg` (mod 360) within `tol` degrees, the distance of the nearest one; Infinity for none. */
export function nearestTurn(cands: number[], deg: number): number {
  let best = Infinity;
  for (const c of cands) { const d = Math.abs((((c - deg) % 360) + 540) % 360 - 180); if (d < best) best = d; }
  return best;
}

/** Every outline corner (and wall end) of `floor`: where the place `got` puts it, against where `truth` does; the worst distance in cm. */
export function cornerError(structure: Pt[], got: TestPlace, truth: TestPlace): number {
  let worst = 0;
  for (const p of structure) { const a = placePt(got, p), b = placePt(truth, p); worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1])); }
  return worst;
}

/** `a` first, then `b`: `compose(a, b)(p) = b(a(p))`. */
export const composePlace = (a: TestPlace, b: TestPlace): TestPlace => {
  const s = turnPt(a.shift, b.turn);
  return { turn: a.turn + b.turn, shift: [s[0] + b.shift[0], s[1] + b.shift[1]] };
};

/** A random star polygon: 6 to 10 corners round [400, 400] at radii 150 to 450, and 2 to 4 stray external walls. Nothing like an orthogonal house. */
export function starFloor(rnd: () => number): Floor {
  const n = 6 + Math.floor(rnd() * 5), pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + rnd() * 0.6) / n) * 2 * Math.PI, r = 150 + rnd() * 300;
    pts.push([Math.round(400 + r * Math.cos(a)), Math.round(400 + r * Math.sin(a))]);
  }
  const f = blank(pts);
  for (let i = 0, m = 2 + Math.floor(rnd() * 3); i < m; i++) {
    const x = rnd() * 800, y = rnd() * 800;
    f.walls.push({ id: `s${i}`, a: [x, y], b: [x + (rnd() - 0.5) * 300, y + (rnd() - 0.5) * 300], kind: "external" } as never);
  }
  return f;
}
