import type { Floor, Pt } from "./schema";
import type { Place } from "./floor-stack";

/**
 * S27.4: where to lay one floor on the floor below it. Translation only, in the floors' stored coordinates.
 *
 * Structure lines of a floor: the outline's edges and every `external` wall; with neither, the edges of every room
 * (zones are only a dotted overlay and are left out). The score is the share of the upper floor's structure length,
 * sampled every 10 cm, that lies within 5 cm of the lower floor's structure lines after the move, 0 to 100.
 *
 * Candidates are every pair of corners (upper, lower), at most 64 corners per floor (the ones with the longest
 * edges), plus no move. The best few are refined by a translation-only nearest-line fit. A tie within 1 point goes
 * to the smaller move, except that moves under 10 cm apart count as one answer and the closest fit of them wins. Layout input is untrusted: nothing here throws.
 *
 * Limits that only a huge or hand-made floor meets: at most 1500 samples (the step grows past 10 cm), and the
 * 800 longest lines of the lower floor.
 */

export type Seg = [number, number, number, number];
export type Sample = { x: number; y: number; w: number };

export interface AlignResult {
  /** cm to add to a point of the upper floor to lay it on the lower one, to 0.1 cm. */
  t: Pt;
  /** 0 to 100: the share of the upper floor's structure that lands within `NEAR` of the lower floor's. */
  score: number;
  /** Under `WEAK_BELOW` per cent. Apply still works; the caller says so. */
  weak: boolean;
}

export const NEAR = 5;
export const WEAK_BELOW = 50;
const STEP = 10, MAX_SAMPLES = 1500, MAX_LOWER = 800, MAX_CORNERS = 64, COARSE = 48, TOP = 3, REFINE_ROUNDS = 40, MAX_REFINED = 16, REFINE_REACH = 25, TIE = 1;
/** The rough pass sees 48 samples, so one sample is about 2 points: its tie window is 4, or a near corner that the full samples tie with the far ones is cut. */
const COARSE_TIE = 4, SHORTLIST = 10, MAX_SHORT = 40;

const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const pt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]);
const list = (x: unknown): any[] => (Array.isArray(x) ? x : []);

function ring(pts: unknown, out: Seg[]): void {
  const p = list(pts);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (pt(a) && pt(b) && (a[0] !== b[0] || a[1] !== b[1])) out.push([a[0], a[1], b[0], b[1]]);
  }
}

/** The structure lines of a floor (see the note at the top). Exported for `floorPivot` (S29.2). */
export function structure(f: unknown): Seg[] {
  const o = typeof f === "object" && f !== null ? (f as Record<string, unknown>) : {};
  const s: Seg[] = [];
  if (list(o.outline).length > 2) ring(o.outline, s);
  for (const w of list(o.walls)) if (typeof w === "object" && w !== null && (w as any).kind === "external" && pt((w as any).a) && pt((w as any).b)) {
    const { a, b } = w as { a: Pt; b: Pt };
    if (a[0] !== b[0] || a[1] !== b[1]) s.push([a[0], a[1], b[0], b[1]]);
  }
  if (s.length) return s;
  for (const r of list(o.rooms)) if (typeof r === "object" && r !== null && (r as any).kind !== "zone") ring((r as any).pts, s);
  return s;
}

const len = (s: Seg) => Math.hypot(s[2] - s[0], s[3] - s[1]);

/** Points along every line, one per `step` cm (at the middle of each piece), each weighing the length it stands for. */
export function sampleLines(segs: Seg[], step: number): Sample[] {
  const out: Sample[] = [];
  for (const s of segs) {
    const l = len(s), n = Math.max(1, Math.round(l / step));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      out.push({ x: s[0] + (s[2] - s[0]) * u, y: s[1] + (s[3] - s[1]) * u, w: l / n });
    }
  }
  return out;
}

const longest = (segs: Seg[], n: number) => (segs.length <= n ? segs : [...segs].sort((a, b) => len(b) - len(a)).slice(0, n));

/** Squared distance from (px, py) to segment s. */
function d2(px: number, py: number, s: Seg): number {
  const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / l2));
  const ex = s[0] + dx * u - px, ey = s[1] + dy * u - py;
  return ex * ex + ey * ey;
}

/** Percent of the sample weight that lies within `NEAR` of a line, after moving by (tx, ty). */
function scoreAt(samples: Sample[], lines: Seg[], tx: number, ty: number): number {
  let hit = 0, all = 0;
  const lim = NEAR * NEAR;
  for (const p of samples) {
    all += p.w;
    const x = p.x + tx, y = p.y + ty;
    for (let i = 0; i < lines.length; i++) if (d2(x, y, lines[i]) <= lim) { hit += p.w; break; }
  }
  return all === 0 ? 0 : (100 * hit) / all;
}

/** Mean distance, in cm, from a sample to its nearest line (capped at `REFINE_REACH`), by weight, after moving by (tx, ty). */
function residual(samples: Sample[], lines: Seg[], tx: number, ty: number): number {
  let sum = 0, all = 0;
  const lim = REFINE_REACH * REFINE_REACH;
  for (const p of samples) {
    const x = p.x + tx, y = p.y + ty;
    let bd = lim;
    for (let i = 0; i < lines.length; i++) { const d = d2(x, y, lines[i]); if (d < bd) bd = d; }
    sum += p.w * Math.sqrt(bd); all += p.w;
  }
  return all === 0 ? 0 : sum / all;
}

interface Fit { t: Pt; score: number; res: number }

/**
 * Point-to-line fit: each sample with a line within reach says how far to move toward it (along the line's normal, or
 * toward its end); the move is the weighted least-squares answer, so a sample on a vertical line speaks for x only and a
 * sample already on its line still counts (it says "stay"). A sample far from the rest of the pulls, such as a free
 * edge that passes near some other line, weighs little: weight 1 / (1 + (d / c)^2)^2 with c the median distance of the
 * pulls on the same axis, at least 2 cm. Repeats until the move is under 0.05 cm (at most `REFINE_ROUNDS`). The score saturates at 100 once every
 * sample is within `NEAR`, so a step is kept when the score is no lower and the mean residual is smaller: that is what
 * takes a floor 4 cm off to 0.
 */
function refine(samples: Sample[], lines: Seg[], t: Pt): Fit {
  let best: Fit = { t, score: scoreAt(samples, lines, t[0], t[1]), res: residual(samples, lines, t[0], t[1]) };
  let tx = t[0], ty = t[1];
  const lim = REFINE_REACH * REFINE_REACH;
  for (let round = 0; round < REFINE_ROUNDS; round++) {
    const rows: { ax: number; ay: number; d: number; w: number }[] = [];
    for (const p of samples) {
      const x = p.x + tx, y = p.y + ty;
      let bd = lim, bi = -1;
      for (let i = 0; i < lines.length; i++) { const d = d2(x, y, lines[i]); if (d < bd) { bd = d; bi = i; } }
      if (bi < 0) continue;
      const s = lines[bi], dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;
      const u = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / l2));
      // Toward the nearest point of the line: along the normal, or toward the end when the sample is past it. A sample
      // on its line has no direction of its own and says "stay" along the line's normal.
      const vx = s[0] + dx * u - x, vy = s[1] + dy * u - y, r = Math.hypot(vx, vy);
      if (r < 1e-9) { const l = Math.sqrt(l2); rows.push({ ax: -dy / l, ay: dx / l, d: 0, w: p.w }); }
      else rows.push({ ax: vx / r, ay: vy / r, d: r, w: p.w });
    }
    if (!rows.length) break;
    // The scale of "far" is the median distance of the rows that speak for the same axis, so a lone far pull on an
    // axis nothing else speaks for still counts, and a pair of strays among many that sit on their line do not.
    const med = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 0);
    const cx = Math.max(2, med(rows.filter((r) => Math.abs(r.ax) >= Math.abs(r.ay)).map((r) => r.d)));
    const cy = Math.max(2, med(rows.filter((r) => Math.abs(r.ax) < Math.abs(r.ay)).map((r) => r.d)));
    let axx = 0, axy = 0, ayy = 0, bx = 0, by = 0, all = 0;
    for (const r of rows) {
      const c = Math.abs(r.ax) >= Math.abs(r.ay) ? cx : cy, k = 1 / (1 + (r.d / c) ** 2) ** 2, w = r.w * k;
      axx += w * r.ax * r.ax; axy += w * r.ax * r.ay; ayy += w * r.ay * r.ay; bx += w * r.ax * r.d; by += w * r.ay * r.d; all += w;
    }
    // A small ridge keeps a direction that no line constrains at zero move.
    const ridge = 1e-12 * all;
    axx += ridge; ayy += ridge;
    const det = axx * ayy - axy * axy;
    const mx = (ayy * bx - axy * by) / det, my = (axx * by - axy * bx) / det;
    if (!Number.isFinite(mx) || !Number.isFinite(my) || (Math.abs(mx) < 0.05 && Math.abs(my) < 0.05)) break;
    tx += mx; ty += my;
    const sc = scoreAt(samples, lines, tx, ty);
    if (sc < best.score) continue;
    const res = residual(samples, lines, tx, ty);
    if (sc > best.score || res <= best.res) best = { t: [tx, ty], score: sc, res };
  }
  return best;
}

/** The corners of the lines, the ones with the longest edges first, at most `MAX_CORNERS`. */
function corners(segs: Seg[]): Pt[] {
  const m = new Map<string, { p: Pt; w: number }>();
  const add = (x: number, y: number, w: number) => {
    const k = `${Math.round(x)},${Math.round(y)}`, c = m.get(k);
    if (c) c.w += w; else m.set(k, { p: [x, y], w });
  };
  for (const s of segs) { const l = len(s); add(s[0], s[1], l); add(s[2], s[3], l); }
  return [...m.values()].sort((a, b) => b.w - a.w).slice(0, MAX_CORNERS).map((c) => c.p);
}

/**
 * S28.12: what `alignFloor` reads of a floor, as a string: the structure lines in stored coordinates, and `owk`. The
 * offset, the title and everything else are left out (the turn the lines are searched at is added, S29.7), so a nudge or an undo (a new floor object, the same structure)
 * gives the same key and the editor does not search again. Never throws; junk gives a key too.
 */
export function alignKey(f: unknown, turn: unknown = 0): string {
  try {
    const o = typeof f === "object" && f !== null ? (f as Record<string, unknown>) : {};
    const owk = Array.isArray(o.owk) ? o.owk.map((k) => (typeof k === "string" ? k : "?")).join(",") : "";
    const t = turnOf(turn);
    return `${structure(f).join(";")}|${owk}${t ? `|turn ${t}` : ""}`; // S29.7: the search reads the turn, so a turn changes the key and a move does not
  } catch {
    return "";
  }
}

const keys = new WeakMap<object, string>();
/**
 * `alignKey` with a memo on the floor object. The editor asks for the key of both floors on every render, and a floor is never edited in
 * place (every edit makes a new object, see EditorState.edit), so an object seen before has the same key. Anything that is not an object is not memoised.
 */
export function alignKeyOf(f: unknown, turn: unknown = 0): string {
  if (typeof f !== "object" || f === null) return alignKey(f, turn);
  let k = keys.get(f);
  if (k === undefined) { k = alignKey(f); keys.set(f, k); }
  const t = turnOf(turn);
  return t ? `${k}|turn ${t}` : k;
}

/** A turn in degrees; anything that is not a finite number reads as 0. */
const turnOf = (t: unknown): number => (num(t) ? t : 0);
/** `s` turned by `deg` clockwise on screen about the origin (a turn of 0 returns it untouched). */
function turnSeg(s: Seg, deg: number): Seg {
  if (deg === 0) return s;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  return [s[0] * c - s[1] * n, s[0] * n + s[1] * c, s[2] * c - s[3] * n, s[2] * n + s[3] * c];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The translation that lays `upper` best on `lower`, and how well it fits; null when either has nothing to match. Never throws.
 * S30.2: this is 0.27.0's `alignFloor`, renamed; the same code and the same answers. `alignFloor` is the search of the turn too (S30.4).
 * S29.7: `turn` (degrees, clockwise, about the origin, as `Place.turn`; junk reads as 0) turns the upper floor's lines before
 * it searches, so `t` is in the lower floor's frame and the place of the upper floor is `{ turn, shift: t }`.
 */
export function alignShift(upper: Floor, lower: Floor, turn: unknown = 0): AlignResult | null {
  try {
    const deg = turnOf(turn);
    const us = structure(upper).map((s) => turnSeg(s, deg));
    const ls = structure(lower);
    if (!us.length || !ls.length) return null;
    const total = us.reduce((a, s) => a + len(s), 0);
    const step = Math.max(STEP, total / MAX_SAMPLES);
    const samples = sampleLines(us, step);
    const lines = longest(ls, MAX_LOWER);
    const coarseLines = longest(ls, 150);
    const stride = Math.max(1, Math.ceil(samples.length / COARSE));
    const coarse = samples.filter((_, i) => i % stride === 0);

    // Candidate moves, deduplicated to the whole cm.
    const seen = new Set<string>(["0,0"]);
    const cands: Pt[] = [[0, 0]];
    const uc = corners(us), lc = corners(ls);
    for (const a of uc) for (const b of lc) {
      const t: Pt = [b[0] - a[0], b[1] - a[1]], k = `${Math.round(t[0])},${Math.round(t[1])}`;
      if (!seen.has(k)) { seen.add(k); cands.push(t); }
    }
    const ranked = cands.map((t) => ({ t, s: scoreAt(coarse, coarseLines, t[0], t[1]) }));
    ranked.sort((a, b) => b.s - a.s);
    // The rough pass is noisy (one sample is about 2 points), so the best SHORTLIST by it, and any within COARSE_TIE,
    // are scored again on the fit samples before the cut. Then: refine every candidate that ties the best of those,
    // the smallest moves first (at most MAX_REFINED), and the best few others. Taking them in generation order would
    // let the corner list decide which tie gets looked at.
    const fitSamples = samples.length > 1000 ? samples.filter((_, i) => i % Math.ceil(samples.length / 1000) === 0) : samples;
    const fitLines = longest(ls, 600);
    const move = (c: Pt) => Math.hypot(c[0], c[1]);
    const short = ranked.filter((c, i) => i < SHORTLIST || c.s >= ranked[0].s - COARSE_TIE).slice(0, MAX_SHORT)
      .map((c) => ({ t: c.t, s: scoreAt(fitSamples, fitLines, c.t[0], c.t[1]) }))
      .sort((a, b) => b.s - a.s);
    const tied = short.filter((c) => c.s >= short[0].s - TIE).sort((a, b) => move(a.t) - move(b.t)).slice(0, MAX_REFINED);
    const picked = [...tied, ...short.filter((c) => c.s < short[0].s - TIE).slice(0, Math.max(0, TOP - tied.length))];

    const finals = picked.map((c) => refine(fitSamples, fitLines, c.t));
    // The no-move case is always in the running, as is its refinement.
    finals.push(refine(fitSamples, fitLines, [0, 0]));
    for (const f of finals) {
      const x = round1(f.t[0]), y = round1(f.t[1]);
      f.score = scoreAt(samples, lines, x, y);
      f.res = residual(fitSamples, fitLines, x, y);
    }
    const top = Math.max(...finals.map((f) => f.score));
    // Among the fits that tie: the smaller move wins, but moves less than 2 * NEAR apart are one answer, and in it the
    // fit with the smallest mean residual wins (a floor 4 cm off scores 100 where it stands, and still has to move).
    const tie = finals.filter((f) => f.score >= top - TIE).sort((a, b) => move(a.t) - move(b.t));
    const near = tie.filter((f) => Math.hypot(f.t[0] - tie[0].t[0], f.t[1] - tie[0].t[1]) <= 2 * NEAR);
    const pick = near.sort((a, b) => a.res - b.res || move(a.t) - move(b.t))[0];
    const t: Pt = [round1(pick.t[0]) + 0, round1(pick.t[1]) + 0];
    const score = Math.round(pick.score * 10) / 10;
    return { t, score, weak: score < WEAK_BELOW };
  } catch {
    return null;
  }
}

/** S30.2, until S30.4 gives `alignFloor` the search of the turn: the editor still calls it with a turn, and gets the translation search of 0.27.0. */
export const alignFloor = alignShift;

// ---- S30.2: candidate turns from direction histograms (constants and reasons: docs/DECISIONS.md, S30.1) ----------------------

const HIST_BIN = 0.25, HIST_SMOOTH = 1, HIST_MIN_LEN = 20, HIST_PEAKS = 3, HIST_PEAK_FRACTION = 0.5, HIST_PEAK_APART = 2, MAX_WEIGHT = 1e6;
/** 0, and four turns for each of at most three peaks. */
export const MAX_TURN_CANDIDATES = 1 + 4 * HIST_PEAKS;

/** Each line from its smaller end (x, then y), the list sorted by its four numbers: the same lines in any order or direction give the same list. */
function canonical(segs: Seg[]): Seg[] {
  return segs.map((s) => (s[0] < s[2] || (s[0] === s[2] && s[1] < s[3]) ? s : ([s[2], s[3], s[0], s[1]] as Seg)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
}

/**
 * Length per direction modulo 90 degrees (a house's walls run in two directions at a right angle, so one peak stands for both),
 * in bins of `HIST_BIN`, a line's weight split between its two nearest bins. Weights are integers (whole cm, at most `MAX_WEIGHT`),
 * so the sums do not depend on the order the lines are added. Lines under `HIST_MIN_LEN` do not count.
 */
function histogram(segs: Seg[]): number[] {
  const nb = Math.round(90 / HIST_BIN), h = new Array<number>(nb).fill(0);
  for (const s of segs) {
    const l = len(s);
    if (!Number.isFinite(l) || l < HIST_MIN_LEN) continue;
    const w = Math.min(Math.round(l), MAX_WEIGHT);
    const deg = (Math.atan2(s[3] - s[1], s[2] - s[0]) * 180) / Math.PI, f = ((((deg % 90) + 90) % 90)) / HIST_BIN, k = Math.floor(f), part = Math.round(w * (f - k));
    h[k % nb] += w - part;
    h[(k + 1) % nb] += part;
  }
  return h;
}

/** Circular cross-correlation: `c[k]` is how well the upper floor's directions turned by `k` bins lie on the lower floor's, smoothed by a triangle of plus or minus `HIST_SMOOTH` degrees. */
function correlation(hu: number[], hl: number[]): number[] {
  const nb = hu.length, c = new Array<number>(nb).fill(0);
  for (let k = 0; k < nb; k++) { let sum = 0; for (let j = 0; j < nb; j++) if (hu[j]) sum += hu[j] * hl[(j + k) % nb]; c[k] = sum; }
  const r = Math.round(HIST_SMOOTH / HIST_BIN), out = new Array<number>(nb).fill(0);
  for (let k = 0; k < nb; k++) { let sum = 0; for (let j = -r; j <= r; j++) sum += (r + 1 - Math.abs(j)) * c[(k + j + nb) % nb]; out[k] = sum; }
  return out;
}

/** `d` degrees as the equal turn in (-45, 45]. */
const wrap45 = (d: number) => { let m = d % 90; if (m > 45) m -= 90; if (m <= -45) m += 90; return m; };
/** `d` degrees as the equal turn in (-180, 180]. */
const wrap180 = (d: number) => { const m = d % 360; return m > 180 ? m - 360 : m <= -180 ? m + 360 : m; };
const round2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** Local maxima of the correlation, at least half the highest and 2 degrees apart, at most three, each sharpened by a parabola through its neighbours (within half a bin). Highest first, ties by the smaller angle. */
function peaks(c: number[]): number[] {
  const nb = c.length, max = Math.max(...c);
  if (!(max > 0) || !Number.isFinite(max)) return [];
  const found: { at: number; v: number }[] = [];
  for (let k = 0; k < nb; k++) {
    const a = c[(k - 1 + nb) % nb], b = c[k], d = c[(k + 1) % nb];
    if (b >= a && b > d && b >= HIST_PEAK_FRACTION * max) {
      const den = a - 2 * b + d, dk = den < 0 ? Math.max(-0.5, Math.min(0.5, (a - d) / (2 * den))) : 0;
      found.push({ at: wrap45((k + dk) * HIST_BIN), v: b });
    }
  }
  found.sort((p, q) => q.v - p.v || Math.abs(p.at) - Math.abs(q.at) || p.at - q.at);
  const out: number[] = [];
  for (const p of found) {
    if (out.length >= HIST_PEAKS) break;
    if (out.some((o) => Math.abs(wrap45(o - p.at)) < HIST_PEAK_APART)) continue;
    out.push(p.at);
  }
  return out;
}

/**
 * S30.2: the turns worth a full search, in degrees. The upper floor's structure directions (modulo 90) are correlated with the
 * lower floor's; each peak `θ` in (-45, 45] gives `θ`, `θ + 90`, `θ + 180` and `θ - 90`, and 0 is always a candidate. Rounded to 0.01 degree,
 * -180 read as 180, deduplicated, sorted: at most `MAX_TURN_CANDIDATES`. `[0]` for junk or a floor with no lines. Reads the stored
 * structure only, so it does not depend on any current turn; the same floors give the same array whatever order their lines come in. Never throws.
 */
export function turnCandidates(upper: unknown, lower: unknown): number[] {
  try {
    const us = canonical(structure(upper)), ls = canonical(structure(lower));
    if (!us.length || !ls.length) return [0];
    const out = new Set<number>([0]);
    for (const at of peaks(correlation(histogram(us), histogram(ls)))) for (const q of [0, 90, 180, -90]) {
      const d = round2(wrap180(at + q));
      if (Number.isFinite(d)) out.add(d === -180 ? 180 : d);
    }
    return [...out].sort((a, b) => a - b);
  } catch {
    return [0];
  }
}

// ---- S30.3: joint refinement of the turn and the shift ------------------------------------------------------------------------

const PLACE_TURN_CAP = 2, PLACE_STOP = 0.05, DEG = Math.PI / 180;

/** The samples (in the upper floor's stored frame) put through a place: turn about the origin, then shift. */
function placed(base: Sample[], p: Place): Sample[] {
  const a = p.turn * DEG, c = Math.cos(a), s = Math.sin(a);
  return base.map((q) => ({ x: q.x * c - q.y * s + p.shift[0], y: q.x * s + q.y * c + p.shift[1], w: q.w }));
}

/** Solves the 3 by 3 system `M x = b`; null when it is singular. */
function solve3(M: number[][], b: number[]): number[] | null {
  const A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

export interface PlaceFit { place: Place; score: number; res: number; rounds: number }

/**
 * S30.3: `refine` for the turn too. Robust weighted least squares in the shift (x, y) and the turn together, from `place`: `samples`
 * are the upper floor's points in its stored frame, `lines` the lower floor's structure. The weights are `refine`'s: each sample pulls
 * toward its nearest line within reach, weight `w / (1 + (d / c)^2)^2`, `c` the per-axis median distance, at least 2 cm.
 *
 * The turn is the unknown scaled by the lever (the weighted RMS distance of the placed samples from their centre), so the three
 * unknowns are all in cm and the normal equations are balanced. It is linearised about the placed samples' weighted centre, recomputed
 * every round: about the origin, a floor far from [0, 0] would couple the turn with a large shift and crawl. The turn moves at most
 * `PLACE_TURN_CAP` degrees from where it started (this refines, it does not search). A step is kept when the score is no lower and the
 * residual no larger (as `refine`). Stops when every component of the step is under `PLACE_STOP` cm (the turn as its move at the lever)
 * or after `REFINE_ROUNDS`. With `turn: false` the turn is held (the shift refit after the turn is rounded). One sample has no lever,
 * so the turn stays. Never throws; junk input gives back the place, made finite.
 */
export function refinePlace(samples: Sample[], lines: Seg[], place: Place, opts: { turn?: boolean } = {}): PlaceFit {
  const start: Place = { turn: turnOf(place?.turn), shift: pt(place?.shift) ? [place.shift[0], place.shift[1]] : [0, 0] };
  try {
    const base = list(samples).filter((q): q is Sample => typeof q === "object" && q !== null && num(q.x) && num(q.y) && num(q.w) && q.w > 0);
    const segs = list(lines).filter((l): l is Seg => Array.isArray(l) && l.length === 4 && l.every(num));
    const free = opts.turn !== false, lim = REFINE_REACH * REFINE_REACH;
    const nearest = (x: number, y: number): [number, number] => {
      let bd = lim, bi = -1;
      for (let i = 0; i < segs.length; i++) { const d = d2(x, y, segs[i]); if (d < bd) { bd = d; bi = i; } }
      return [bd, bi];
    };
    const measure = (cur: Sample[]) => ({ score: scoreAt(cur, segs, 0, 0), res: residual(cur, segs, 0, 0) });
    let p = start, cur = placed(base, p);
    let best = { place: p, ...measure(cur) }, rounds = 0;
    for (; rounds < REFINE_ROUNDS; rounds++) {
      let sw = 0, cx = 0, cy = 0;
      for (const q of cur) { sw += q.w; cx += q.w * q.x; cy += q.w * q.y; }
      if (!(sw > 0)) break;
      cx /= sw; cy /= sw;
      let lever = 0;
      for (const q of cur) lever += q.w * ((q.x - cx) ** 2 + (q.y - cy) ** 2);
      lever = Math.sqrt(lever / sw);
      const rows: { ax: number; ay: number; at: number; d: number; w: number }[] = [];
      for (const q of cur) {
        const bi = nearest(q.x, q.y)[1];
        if (bi < 0) continue;
        const s = segs[bi], dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
        if (l2 === 0) continue;
        const u = Math.max(0, Math.min(1, ((q.x - s[0]) * dx + (q.y - s[1]) * dy) / l2));
        const vx = s[0] + dx * u - q.x, vy = s[1] + dy * u - q.y, r = Math.hypot(vx, vy);
        let ax: number, ay: number, d: number;
        if (r < 1e-9) { const l = Math.sqrt(l2); ax = -dy / l; ay = dx / l; d = 0; } else { ax = vx / r; ay = vy / r; d = r; }
        // A turn clockwise on screen moves the point (x, y) about the centre by (-(y - cy), x - cx) per radian.
        rows.push({ ax, ay, at: ax * -(q.y - cy) + ay * (q.x - cx), d, w: q.w });
      }
      if (!rows.length) break;
      const med = (a: number[]) => (a.length ? a.sort((m, n) => m - n)[a.length >> 1] : 0);
      const kx = Math.max(2, med(rows.filter((r) => Math.abs(r.ax) >= Math.abs(r.ay)).map((r) => r.d)));
      const ky = Math.max(2, med(rows.filter((r) => Math.abs(r.ax) < Math.abs(r.ay)).map((r) => r.d)));
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
      let all = 0;
      for (const r of rows) {
        const c = Math.abs(r.ax) >= Math.abs(r.ay) ? kx : ky, w = r.w / (1 + (r.d / c) ** 2) ** 2;
        const v = [r.ax, r.ay, free && lever > 0 ? r.at / lever : 0];
        for (let i = 0; i < 3; i++) { b[i] += w * v[i] * r.d; for (let j = 0; j < 3; j++) M[i][j] += w * v[i] * v[j]; }
        all += w;
      }
      for (let i = 0; i < 3; i++) M[i][i] += 1e-9 * all; // keeps a direction that nothing constrains at zero move
      const x = solve3(M, b);
      if (!x) break;
      const mx = x[0], my = x[1];
      let dth = free && lever > 0 ? x[2] / lever / DEG : 0;
      if (!Number.isFinite(dth) || !Number.isFinite(mx) || !Number.isFinite(my)) break;
      dth = Math.max(start.turn - PLACE_TURN_CAP, Math.min(start.turn + PLACE_TURN_CAP, p.turn + dth)) - p.turn;
      if (Math.abs(mx) < PLACE_STOP && Math.abs(my) < PLACE_STOP && Math.abs(dth * DEG) * lever < PLACE_STOP) break;
      // Turn by dth about the centre (cx, cy), then move by (mx, my): in terms of the place, the turn adds and the shift turns with it.
      const a = dth * DEG, co = Math.cos(a), si = Math.sin(a);
      const sx = cx - (cx * co - cy * si) + mx, sy = cy - (cx * si + cy * co) + my;
      p = { turn: p.turn + dth, shift: [p.shift[0] * co - p.shift[1] * si + sx, p.shift[0] * si + p.shift[1] * co + sy] };
      cur = placed(base, p);
      const m = measure(cur);
      if (m.score < best.score) continue;
      if (m.score > best.score || m.res <= best.res) best = { place: p, ...m };
    }
    const ok = Number.isFinite(best.place.turn) && pt(best.place.shift);
    return ok ? { ...best, rounds } : { place: start, score: 0, res: 0, rounds };
  } catch {
    return { place: start, score: 0, res: 0, rounds: 0 };
  }
}
