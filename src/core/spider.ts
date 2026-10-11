import type { Pt } from "./schema";

// S25.5: spiderfy. Devices whose discs overlap on screen are a stack, and a tap on a stack fans its members out in a ring.
// Pure geometry only; renderFloor draws the ring (`RenderOpts.spider`) and the card decides when it is open.

/** Two device centres closer than this many screen px are a stack: it is the width of a device disc (32k plan units, never under 29 px, `NAME_MIN_PX`). */
export const STACK_PX = 32;
/** Members of a ring sit at least this far apart on screen: a touch target. */
export const SPIDER_GAP_PX = 44;
/** The smallest ring radius on screen, so two members do not sit side by side at the stack. */
export const SPIDER_MIN_R_PX = 40;
/** The most members one ring takes. */
export const SPIDER_MAX = 8;
/** Room kept beside the ring, on screen, for the names that stand outside it. */
const LABEL_PX = 110;

const isPt = (p: unknown): p is Pt =>
  Array.isArray(p) &&
  p.length === 2 &&
  typeof p[0] === "number" &&
  typeof p[1] === "number" &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]);

/**
 * The indices of points that form a stack, as groups of two or more, by first index. Two points closer than `minDist`
 * are linked and links chain, so a-b and b-c close with a-c far is one group. Untrusted input: a junk point is skipped,
 * a junk `minDist` (not a finite number above 0) or a non-array gives none.
 */
export function stackGroups(points: readonly unknown[], minDist: number): number[][] {
  if (!Array.isArray(points) || typeof minDist !== "number" || !Number.isFinite(minDist) || !(minDist > 0)) return [];
  const ok: number[] = [];
  points.forEach((p, i) => {
    if (isPt(p)) ok.push(i);
  });
  const root = new Map<number, number>(ok.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (root.get(r) !== r) r = root.get(r)!;
    return r;
  };
  for (let a = 0; a < ok.length; a++)
    for (let b = a + 1; b < ok.length; b++) {
      const p = points[ok[a]] as Pt,
        q = points[ok[b]] as Pt;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < minDist) root.set(find(ok[b]), find(ok[a]));
    }
  const groups = new Map<number, number[]>();
  for (const i of ok) {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return [...groups.values()].filter((g) => g.length > 1).sort((x, y) => x[0] - y[0]);
}

/** What the ring must clear, in screen px: the drawn disc (`32k` plan units, so it grows with the zoom), the widest name beside a member, the name's font size. */
export interface SpiderSize {
  disc: number;
  tag?: number;
  font?: number;
}

/** The width of a name tag on screen for a name of `chars` characters at `font` px, an upper estimate (a plan unit of text is never wider than 0.6 em per character) capped at `LABEL_PX`. */
export const tagWidth = (chars: number, font: number): number =>
  Math.min(LABEL_PX, Math.max(0, chars) * 0.6 * font + 4);

/** The name tag's gap to its member's centre, as `renderFloor` draws it: 20k beside a 32k disc. */
const TAG_GAP = 20 / 32;

type Box = [number, number, number, number]; // x0, y0, x1, y1

/** Whether a ring of radius `r` (px) puts any member's disc or name tag on another's. */
function clashes(n: number, r: number, size: SpiderSize): boolean {
  const D = size.disc,
    tag = size.tag ?? 0,
    font = size.font ?? 12,
    pad = 3;
  const c = Array.from({ length: n }, (_, j) => [
    r * Math.cos(-Math.PI / 2 + (2 * Math.PI * j) / n),
    r * Math.sin(-Math.PI / 2 + (2 * Math.PI * j) / n),
  ]);
  const tags: Box[] = tag
    ? c.map(([x, y]) => {
        const right = x >= -1e-6, // the rule `renderFloor` uses: outward of the ring's side
          x0 = x + (right ? 1 : -1) * TAG_GAP * D;
        return [
          Math.min(x0, x0 + (right ? 1 : -1) * tag),
          y - 0.6 * font,
          Math.max(x0, x0 + (right ? 1 : -1) * tag),
          y + 0.6 * font,
        ];
      })
    : [];
  const discHits = (j: number, b: Box) => {
    const nx = Math.min(b[2], Math.max(b[0], c[j][0])),
      ny = Math.min(b[3], Math.max(b[1], c[j][1]));
    return Math.hypot(nx - c[j][0], ny - c[j][1]) < D / 2 + pad;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]) < D + pad) return true;
      if (tags.length) {
        const a = tags[i],
          b = tags[j];
        if (a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad) return true;
      }
    }
  if (tags.length)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && discHits(j, tags[i])) return true;
  return false;
}

/**
 * Where the members of a stack go: evenly on one ring about the mean of their true spots, the first straight up. `unit`
 * is plan units per screen px, so the ring is the same size on screen at any zoom. The centre is moved until the ring and
 * room for the names beside it lie inside `box` (a box too small gets the ring at its centre). Junk gives none.
 * `size`, when given, is what the ring must clear on screen: it grows until no disc or name tag lies on another, because the
 * discs grow with the zoom and a ring of fixed size sank under them (UI refactor, item 8).
 */
export function spiderLayout(
  spots: readonly unknown[],
  unit: number,
  box: { x: number; y: number; w: number; h: number },
  size?: SpiderSize,
): Pt[] {
  if (
    !Array.isArray(spots) ||
    !spots.length ||
    !spots.every(isPt) ||
    typeof unit !== "number" ||
    !Number.isFinite(unit) ||
    !(unit > 0)
  )
    return [];
  const n = spots.length;
  const mean: Pt = [spots.reduce((s, p) => s + p[0], 0) / n, spots.reduce((s, p) => s + p[1], 0) / n];
  let rPx = Math.max(SPIDER_MIN_R_PX, n > 1 ? SPIDER_GAP_PX / (2 * Math.sin(Math.PI / n)) : 0);
  const D = size && typeof size.disc === "number" && Number.isFinite(size.disc) && size.disc > 0 ? size.disc : 0;
  if (D && n > 1) {
    const sz: SpiderSize = {
      disc: D,
      tag: typeof size!.tag === "number" && Number.isFinite(size!.tag) && size!.tag > 0 ? size!.tag : 0,
      font: typeof size!.font === "number" && Number.isFinite(size!.font) && size!.font > 0 ? size!.font : 12,
    };
    for (let g = 0; g < 400 && clashes(n, rPx, sz); g++) rPx += Math.max(2, D / 40);
  }
  const r = rPx * unit;
  const fit = (v: number, lo: number, hi: number, mid: number) => (lo > hi ? mid : Math.min(hi, Math.max(lo, v)));
  const okBox = box && [box.x, box.y, box.w, box.h].every((v) => typeof v === "number" && Number.isFinite(v));
  let cx = mean[0],
    cy = mean[1];
  if (okBox) {
    const mx = Math.min(LABEL_PX * unit, Math.max(0, (box.w - 2 * r) / 4)),
      my = Math.min(24 * unit, Math.max(0, (box.h - 2 * r) / 4));
    cx = fit(cx, box.x + r + mx, box.x + box.w - r - mx, box.x + box.w / 2);
    cy = fit(cy, box.y + r + my, box.y + box.h - r - my, box.y + box.h / 2);
  }
  return spots.map(
    (_, j) =>
      [
        cx + r * Math.cos(-Math.PI / 2 + (2 * Math.PI * j) / n),
        cy + r * Math.sin(-Math.PI / 2 + (2 * Math.PI * j) / n),
      ] as Pt,
  );
}
