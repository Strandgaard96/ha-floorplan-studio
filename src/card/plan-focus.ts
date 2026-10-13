/* Spatial focus on the plan (S31.4, spec D4). Pure geometry over screen points; the card decides which devices are
 * drawn and what a key does with the answer.
 *
 * Why a cone. Arrows move focus to "the device in that direction on screen". On a plan turned 45 degrees there is no
 * row or column to follow, so the answer is geometric: a candidate counts for a direction when it lies inside a
 * half-cone of 45 degrees about it (along > 0 and across <= along). Four such cones tile the plane exactly, so every
 * other device belongs to at least one arrow and none is unreachable by arrows alone.
 *
 * The edge is in. A grid turned 45 degrees has its neighbours exactly on the edge of two cones (one step along a
 * grid axis is 45 degrees on screen). With an open edge those neighbours would drop out of right/left/up/down and the
 * turned grid would only be walkable along its diagonals. Rotation leaves float noise, so "on the edge" is judged
 * with a tiny relative tolerance (EPS), never with an exact comparison.
 *
 * Which of the candidates. Cost = along + 2 * across. The cross distance counts double so that a device straight
 * ahead beats a nearer one slanting off: a row reads as a row, and focus does not jump to a neighbour in the next
 * row because it is a little closer. Weight 1 (along + across) lets a slanted neighbour 10 along and 9 across (cost 19) tie
 * with a straight one 19 away; weight 2 (cost 28 against 19) keeps the straight one winning only when it is truly near.
 * A narrower cone would strand devices, so the cone stays 45 degrees and the weight does the preferring.
 *
 * Ties. Two candidates whose costs agree within EPS go to the lower index. That is stable (the same press gives
 * the same answer) and the host controls it by the order it passes the points in (reading order: floor, room, device).
 * A tie is not rare: on the turned grid the two edge neighbours cost the same, so it must be decided, not left to
 * float noise. The tolerance is what makes a mathematically exact tie a tie after rotation.
 *
 * Not reversible, on purpose. A device on a cone's edge may be reached from A by "right" while "left" from it goes
 * elsewhere. Reversibility would need a global order; the spec asks only for "nearest in that direction".
 *
 * Nothing found returns `from`, so the host can say "no change" by comparing. Junk points (not an object, x or y not
 * a finite number) are skipped; a junk or out-of-range `from` is returned as it is. A point exactly on `from` has no
 * direction and is never chosen, so two devices stacked at one spot are reached by the lower index only.
 */

export type FocusDir = "left" | "right" | "up" | "down";
export interface FocusPoint { x: number; y: number }

/** Relative tolerance for "on the cone's edge" and "equal cost". Rotation error is ~1e-15; 1e-9 is far above it and
 * far below any real gap between two devices drawn on a screen. */
const EPS = 1e-9;

const isPoint = (p: unknown): p is FocusPoint =>
  typeof p === "object" && p !== null && Number.isFinite((p as FocusPoint).x) && Number.isFinite((p as FocusPoint).y);

/** Screen axes: y grows downwards. */
const AXES: Record<FocusDir, (dx: number, dy: number) => [number, number]> = {
  right: (dx, dy) => [dx, dy],
  left: (dx, dy) => [-dx, dy],
  down: (dx, dy) => [dy, dx],
  up: (dx, dy) => [-dy, dx],
};

/** The index of the next device from `from` towards `dir`, or `from` when there is none. */
export function nextInDirection(points: readonly unknown[], from: number, dir: FocusDir): number {
  const axis = AXES[dir];
  const origin = Array.isArray(points) ? points[from] : undefined;
  if (!axis || !isPoint(origin)) return from;
  let best = from, bestCost = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === from || !isPoint(p)) continue;
    const [along, across] = axis(p.x - origin.x, p.y - origin.y);
    const side = Math.abs(across);
    if (along <= 0 || side > along * (1 + EPS)) continue;
    const cost = along + 2 * side;
    // Strictly cheaper by more than the tolerance replaces; an equal cost keeps the earlier (lower) index.
    if (best === from || cost < bestCost - EPS * Math.max(1, bestCost)) { best = i; bestCost = cost; }
  }
  return best;
}

/** The device a Tab into the plan lands on: the nearest to `centre` (Euclidean), a tie to the lower index. -1 when
 * there is no good point. A junk centre takes the first good point. */
export function firstFocus(points: readonly unknown[], centre: unknown): number {
  const c = isPoint(centre) ? centre : null;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!isPoint(p)) continue;
    if (!c) return i;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (best < 0 || d < bestD - EPS * Math.max(1, bestD)) { best = i; bestD = d; }
  }
  return best;
}
