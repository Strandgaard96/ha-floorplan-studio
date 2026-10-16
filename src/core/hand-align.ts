import { composePlace, normaliseTurn, placePoint, type Place } from "./floor-stack";
import { stairBlocks } from "./solids";
import type { Floor, Pt, Stairs } from "./schema";

/*
 * S29.8: the stair report and Align stairs. Pure; layout input is untrusted, so nothing here throws.
 *
 * DESIGN NOTE (the reversed flight).
 * A straight flight has two ends, `low` (the middle of the edge the first step starts at) and `top` (the middle of the
 * opposite edge). Floors are drawn by hand, and a flight that goes up from the basement may be drawn with its low end at
 * the other side from the one on the floor above, so "low meets low" is only one of two honest readings. We try both:
 *   same order:   upper low -> lower low,  upper top -> lower top   turn d1 = angle(lower) - angle(upper)
 *   reversed:     upper low -> lower top,  upper top -> lower low   turn d2 = angle(lower) + 180 - angle(upper)
 * and the smaller |turn| wins (a tie keeps the same order). Reversed meets the upper low end with the lower TOP end, not
 * low with low, so that the two footprints coincide when the flights are the same length; low with low after a half
 * turn would leave them one flight length apart. The floor turns about the anchor (the upper end that is moved onto the
 * lower one), so the anchor lands exactly.
 * A round stair has a centre only: move, never turn; so does a pair of one round and one straight (centres meet).
 * Places are absolute: `stairPlace(upper, lower, place)` reads the stairs as `place` currently draws them, and returns the
 * place that lays them together, the turn that was in `place` plus the extra turn.
 * Text carries raw names (they are layout input); whoever puts it in HTML escapes it.
 */

export interface StairAxis {
  /** The middle of the stair's bounding box: the point `stairBlocks` turns it about. */
  centre: Pt;
  /** Straight flights only: the middle of the low edge, and of the top edge. */
  low?: Pt;
  top?: Pt;
}

const finitePt = (p: unknown): p is Pt =>
  Array.isArray(p) &&
  p.length === 2 &&
  typeof p[0] === "number" &&
  typeof p[1] === "number" &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]);
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The ends of a straight flight (low-edge and top-edge middles) or the centre of a round one, in the floor's frame, with `rot` applied. Null for a stair that cannot be drawn. */
export function stairAxis(t: Stairs): StairAxis | null {
  try {
    if (!t || typeof t !== "object") return null;
    const blocks = stairBlocks(t);
    if (!blocks || !blocks.steps.length) return null;
    const xs = t.pts.map((p) => p[0]),
      ys = t.pts.map((p) => p[1]);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys),
      c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
    if (t.shape === "round") return finitePt(c) ? { centre: c } : null;
    const first = blocks.steps[0],
      last = blocks.steps[blocks.steps.length - 1],
      i = blocks.lowEdge;
    const low = mid(first[i], first[(i + 1) % 4]),
      top = mid(last[(i + 2) % 4], last[(i + 3) % 4]);
    return finitePt(low) && finitePt(top) && finitePt(c) ? { centre: c, low, top } : null;
  } catch {
    return null;
  }
}

/** Each stair of a floor that can be drawn, with its axis. Junk is skipped. */
function stairsOf(f: unknown): { t: Stairs; axis: StairAxis }[] {
  const list = f && typeof f === "object" ? (f as { stairs?: unknown }).stairs : undefined;
  if (!Array.isArray(list)) return [];
  const out: { t: Stairs; axis: StairAxis }[] = [];
  for (const t of list) {
    const axis = stairAxis(t as Stairs);
    if (axis) out.push({ t: t as Stairs, axis });
  }
  return out;
}

const nameOf = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
const idOf = (v: unknown) => (typeof v === "string" ? v : "");
const SAFE: Place = { turn: 0, shift: [0, 0] };
const safePlace = (p: unknown): Place => {
  const q = p as Place | undefined;
  return q && typeof q === "object" && typeof q.turn === "number" && Number.isFinite(q.turn) && finitePt(q.shift)
    ? { turn: q.turn, shift: [q.shift[0], q.shift[1]] }
    : SAFE;
};
const angleOf = (a: Pt, b: Pt) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** The angle between two lines, modulo 180, the smaller way round: 0 to 90. */
const lineGap = (a: number, b: number) => {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

/** The one rule for "which stair below": the nearest by centre distance to `c` (the upper stair's centre as the place draws it); the first wins a tie. The report and Align stairs both ask here. */
function nearestBelow(
  c: Pt,
  below: { t: Stairs; axis: StairAxis }[],
): { b: { t: Stairs; axis: StairAxis }; d: number } | null {
  let best: { t: Stairs; axis: StairAxis } | null = null,
    bestD = Infinity;
  for (const b of below) {
    const d = dist(c, b.axis.centre);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best ? { b: best, d: bestD } : null;
}

export interface StairRow {
  id: string;
  name: string;
  /** The nearest stair of the floor below by centre distance, or null when it has none. */
  nearest: { id: string; name: string } | null;
  /** cm between the centres in the frame of the floor below, or null with no stair below. */
  distance: number | null;
  /** Degrees between the flights' axes, modulo 180, 0 to 90; null when either stair is round or none lies below. */
  angle: number | null;
}

/** For each upper stair that can be drawn: the nearest lower stair, the centre distance and the axis angle, with the upper stair drawn by `place`. */
export function stairReport(upper: Floor, lower: Floor, place: Place): StairRow[] {
  const pl = safePlace(place),
    below = stairsOf(lower);
  return stairsOf(upper).map(({ t, axis }) => {
    const row: StairRow = {
      id: idOf(t.id),
      name: nameOf(t.name, "Stairs"),
      nearest: null,
      distance: null,
      angle: null,
    };
    const c = placePoint(pl, axis.centre);
    const n = nearestBelow(c, below);
    if (!n) return row;
    const best = n.b;
    row.nearest = { id: idOf(best.t.id), name: nameOf(best.t.name, "Stairs") };
    row.distance = n.d;
    if (axis.low && axis.top && best.axis.low && best.axis.top)
      row.angle = lineGap(
        angleOf(placePoint(pl, axis.low), placePoint(pl, axis.top)),
        angleOf(best.axis.low, best.axis.top),
      );
    return row;
  });
}

export interface StairPlaceResult {
  /** The place that lays the upper floor's first stair on the nearest stair below. */
  place: Place;
  /** cm the anchor point moved. */
  moved: number;
  /** Degrees turned, 0 or more. */
  turned: number;
  /** One of the two stairs is round: moved, not turned. */
  round: boolean;
  /** "Aligned Ground stairs to Basement stairs: moved 34 cm, turned 2.1°". Raw names. */
  text: string;
}

/** Lay the first stair with a footprint of `upper` (drawn as `place` draws it) on the stair of `lower` nearest to it (the report's rule). Null when either floor has none. */
export function stairPlace(upper: Floor, lower: Floor, place: Place): StairPlaceResult | null {
  const u = stairsOf(upper)[0];
  if (!u) return null;
  const pl = safePlace(place);
  const near = nearestBelow(placePoint(pl, u.axis.centre), stairsOf(lower));
  if (!near) return null;
  const l = near.b;
  let anchor: Pt,
    target: Pt,
    d = 0,
    round = true;
  if (u.axis.low && u.axis.top && l.axis.low && l.axis.top) {
    const pLow = placePoint(pl, u.axis.low),
      pTop = placePoint(pl, u.axis.top),
      au = angleOf(pLow, pTop),
      al = angleOf(l.axis.low, l.axis.top);
    const same = normaliseTurn(al - au),
      rev = normaliseTurn(al + 180 - au);
    round = false;
    anchor = pLow;
    if (Math.abs(rev) < Math.abs(same)) {
      d = rev;
      target = l.axis.top;
    } else {
      d = same;
      target = l.axis.low;
    }
  } else {
    anchor = placePoint(pl, u.axis.centre);
    target = l.axis.centre;
  }
  // Turn about the anchor, then carry it onto the target: p'' = R(d)·(p' - anchor) + target.
  const turnedAnchor = placePoint({ turn: d, shift: [0, 0] }, anchor);
  const next = composePlace(pl, { turn: d, shift: [target[0] - turnedAnchor[0], target[1] - turnedAnchor[1]] });
  const out: Place = { turn: normaliseTurn(next.turn), shift: next.shift };
  if (!Number.isFinite(out.turn) || !finitePt(out.shift)) return null;
  const moved = dist(anchor, target),
    turned = Math.abs(d);
  const base = `Aligned ${nameOf(u.t.name, "Stairs")} to ${nameOf(l.t.name, "Stairs")}`;
  const text = round
    ? `${base}: moved ${Math.round(moved)} cm (round stairs: moved, not turned)`
    : `${base}: moved ${Math.round(moved)} cm, turned ${Math.round(turned * 10) / 10}°`;
  return { place: out, moved, turned, round, text };
}
