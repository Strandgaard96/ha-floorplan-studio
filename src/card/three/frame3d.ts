// The framing maths of the 3D view, pure: no three.js, no DOM, so it is unit-tested against three itself without WebGL
// (tests/card/three-frame3d.test.ts). Everything is in three's frame: x east, y up, z south, as the Orbit keeps it.
//
// `shift` is how far the whole picture moves on the canvas, in px (positive: right and down). The view applies it as a lens
// shift, `camera.setViewOffset(w, h, -shift[0], -shift[1], w, h)`: three moves the frustum's window, so the picture goes the
// other way, hence the minus. The camera still looks at its target; only the picture slides.
// Junk (NaN, Infinity, a zero canvas, an inverted box) gives null, never a throw.
export type V3 = [number, number, number];
export interface Box { min: V3; max: V3 }
export interface Cam { az: number; polar: number; distance: number; target: V3 }
export interface Canvas { w: number; h: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Fit { distance: number; target: V3; shift: [number, number] }

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const vec = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(fin);
const canvasOk = (c: Canvas | null | undefined): c is Canvas => !!c && fin(c.w) && fin(c.h) && c.w > 0 && c.h > 0;
const fovOk = (f: number) => fin(f) && f > 1 && f < 120;
/** The pole itself has no azimuth: keep the polar a hair inside, as the Orbit's clamp does. */
const POLE = 1e-3;
const clampPolar = (p: number) => Math.min(Math.PI - POLE, Math.max(POLE, p));

/** Camera axes: `out` from target to eye, `f` forward, `r` right, `u` up. */
function basis(az: number, polar: number) {
  const p = clampPolar(polar), sp = Math.sin(p), out: V3 = [sp * Math.sin(az), Math.cos(p), sp * Math.cos(az)];
  const f: V3 = [-out[0], -out[1], -out[2]];
  // right = normalize(f x up), up = right x f.
  const r: V3 = [-f[2] / sp, 0, f[0] / sp];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { out, f, r, u };
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Where a point of the model lands on the canvas, px from its top left: three's `PerspectiveCamera` (vertical field `fovDeg`,
 * aspect w/h) looking from `cam` at its target, then `setViewOffset` by `shift`. Null for a point at or behind the camera.
 */
export function project(p: V3, canvas: Canvas, cam: Cam, fovDeg: number, shift: [number, number]): { x: number; y: number } | null {
  if (!vec(p) || !canvasOk(canvas) || !cam || !fin(cam.az) || !fin(cam.polar) || !fin(cam.distance) || cam.distance <= 0 || !vec(cam.target) || !fovOk(fovDeg) || !Array.isArray(shift) || !fin(shift[0]) || !fin(shift[1])) return null;
  const { f, r, u } = basis(cam.az, cam.polar);
  const rel: V3 = [p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]];
  const depth = cam.distance + dot(rel, f);
  if (!(depth > 1e-9)) return null;
  const k = canvas.h / 2 / Math.tan((fovDeg * Math.PI) / 360), cx = dot(rel, r), cy = dot(rel, u);
  return { x: canvas.w / 2 + (cx / depth) * k + shift[0], y: canvas.h / 2 - (cy / depth) * k + shift[1] };
}

/**
 * The smallest distance at which the eight corners of `box`, seen from azimuth `az` and `polar`, all project inside `visible`
 * (a rect on the canvas) less a margin of max(12 px, 5 % of its short side), with the projected extent of the corners centred on the
 * visible box (equal slack on opposite sides). The camera looks at the box's centre; `shift` slides the picture so the extent's centre
 * lands on the visible centre (S32.4: not the box's own centre, which perspective leaves off-centre). Found by bisection: the further the
 * camera, the smaller every corner's offset from the centre, so "fits" is monotone in the distance once every corner is in
 * front of the camera. `limits` (min, max distance) clamp the result, the shift worked out at the clamped distance.
 */
export function fitBox(box: Box, az: number, polar: number, fovDeg: number, canvas: Canvas, visible: Rect, limits?: readonly [number, number]): Fit | null {
  if (!box || !vec(box.min) || !vec(box.max) || box.min.some((v, i) => v > box.max[i])) return null;
  if (!fin(az) || !fin(polar) || !fovOk(fovDeg) || !canvasOk(canvas) || !visible) return null;
  const { left, top, right, bottom } = visible;
  if (![left, top, right, bottom].every(fin) || !(right > left) || !(bottom > top)) return null;
  if (left < 0 || top < 0 || right > canvas.w || bottom > canvas.h) return null;
  const vw = right - left, vh = bottom - top, m = Math.max(12, 0.05 * Math.min(vw, vh));
  const hx = vw / 2 - m, hy = vh / 2 - m;
  if (!(hx > 0 && hy > 0)) return null;
  const target: V3 = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as V3;
  const { f, r, u } = basis(az, polar), k = canvas.h / 2 / Math.tan((fovDeg * Math.PI) / 360);
  const pts: { x: number; y: number; z: number }[] = [];
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const rel: V3 = [x - target[0], y - target[1], z - target[2]];
    pts.push({ x: dot(rel, r), y: dot(rel, u), z: dot(rel, f) });
  }
  const behind = Math.max(0, ...pts.map((q) => -q.z));
  // The corners' extent on screen at distance d (px, relative to the canvas centre, y down), or null if a corner is behind the lens.
  const span = (d: number) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of pts) {
      const depth = d + q.z;
      if (!(depth > 1e-9)) return null;
      const x = (q.x / depth) * k, y = (-q.y / depth) * k;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  };
  const fits = (d: number) => { const e = span(d); return !!e && (e.x1 - e.x0) / 2 <= hx && (e.y1 - e.y0) / 2 <= hy; };
  let lo = behind, hi = Math.max(1, behind * 2);
  for (let i = 0; i < 80 && !fits(hi); i++) { lo = hi; hi *= 2; }
  if (!fits(hi)) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  // `limits` clamp the distance before the shift is worked out, so a held-back camera is still centred at the distance it really has.
  const fitted = Math.max(1, hi), distance = limits && fin(limits[0]) && fin(limits[1]) ? Math.min(limits[1], Math.max(limits[0], fitted)) : fitted, e = span(distance);
  if (!e) return null;
  // The extent's own centre goes to the visible centre (equal margins on opposite sides), not the box's centre: under perspective
  // the near side is drawn larger, so the two differ.
  const shift: [number, number] = [(left + right) / 2 - canvas.w / 2 - (e.x0 + e.x1) / 2, (top + bottom) / 2 - canvas.h / 2 - (e.y0 + e.y1) / 2];
  return { distance, target, shift };
}

/** Ease-out cubic. */
const ease = (t: number) => 1 - (1 - t) ** 3;
const camOk = (c: Cam | null | undefined): c is Cam => !!c && fin(c.az) && fin(c.polar) && fin(c.distance) && vec(c.target);

/**
 * The camera `t` (0 to 1) of the way from `from` to `to`: ease-out cubic; the azimuth the short way round (across plus or minus
 * pi); the distance on a log scale (linear if either is not positive). t outside 0..1 is clamped, NaN is 0. At 1 it is `to`.
 * Null when either camera is junk.
 */
export function glide(from: Cam, to: Cam, t: number): Cam | null {
  if (!camOk(from) || !camOk(to)) return null;
  const s = fin(t) ? Math.min(1, Math.max(0, t)) : 0;
  if (s === 0) return { az: from.az, polar: from.polar, distance: from.distance, target: [...from.target] };
  if (s === 1) return { az: to.az, polar: to.polar, distance: to.distance, target: [...to.target] };
  const e = ease(s), TAU = Math.PI * 2;
  const turn = ((((to.az - from.az + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const distance = from.distance > 0 && to.distance > 0 ? from.distance * (to.distance / from.distance) ** e : from.distance + (to.distance - from.distance) * e;
  return {
    az: from.az + turn * e,
    polar: from.polar + (to.polar - from.polar) * e,
    distance,
    target: [0, 1, 2].map((i) => from.target[i] + (to.target[i] - from.target[i]) * e) as V3,
  };
}
