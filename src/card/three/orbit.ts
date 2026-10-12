// The camera of the 3D view as plain maths: where it stands, and what a drag, a wheel turn and a pan do to it. No
// three.js and no DOM, so it is unit-tested without WebGL. It replaces three's OrbitControls (an addon, with damping and
// touch handling the card does not need): a small class, a few hundred bytes, and a polar clamp of its own.
//
// Frame: three's. x east, y up, z south (plan y). `azimuth` 0 puts the camera south of the target, positive turns it
// toward the east. `polar` is the angle from straight up: 0 is top-down, pi/2 the horizon.
type V3 = [number, number, number];
export interface Bounds {
  min: V3;
  max: V3;
}

/** radians. Not quite top-down (the azimuth would mean nothing there) and not quite the horizon (never under the floor). */
export const MIN_POLAR = 0.1,
  MAX_POLAR = 1.45;
/** The start: 50 degrees above the horizon. */
const START_POLAR = (40 * Math.PI) / 180;
/** radians per pixel dragged. */
const ROTATE_RATE = 0.006;
/** The closest and furthest the camera goes, as a multiple of the distance that frames the house. */
const NEAR_FACTOR = 0.15,
  FAR_FACTOR = 4;
/** How much of the free part of the view the house's box fills at the first view (UI refactor item 11). */
const FILL = 0.85;

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Orbit {
  azimuth = 0;
  polar = START_POLAR;
  distance = 1;
  target: V3 = [0, 0, 0];
  private start = { azimuth: 0, polar: START_POLAR, distance: 1, target: [0, 0, 0] as V3 };
  private fit = 1;
  private lo: V3 = [0, 0, 0];
  private hi: V3 = [0, 0, 0];
  private fov: number;
  private aspect: number;
  private left = 0;
  private right = 0;
  private top = 0;
  private slide: [number, number] = [0, 0];

  /** `bounds` are the scene's, in the plan's frame (x, y, z up, cm); `fovDeg` the camera's vertical field; `turnDeg` the plan's turn. */
  constructor(bounds: Bounds, aspect: number, fovDeg: number, turnDeg: number) {
    const ok =
      bounds && Array.isArray(bounds.min) && Array.isArray(bounds.max) && [...bounds.min, ...bounds.max].every(fin);
    const mn = ok ? bounds.min : [0, 0, 0],
      mx = ok ? bounds.max : [0, 0, 0];
    // Plan (x, y, z up) to three (x, z, y).
    this.lo = [mn[0], mn[2], mn[1]];
    this.hi = [mx[0], mx[2], mx[1]];
    this.fov = ((fin(fovDeg) && fovDeg > 1 && fovDeg < 120 ? fovDeg : 40) * Math.PI) / 180;
    this.aspect = fin(aspect) && aspect > 0 ? aspect : 1;
    this.target = [0, 1, 2].map((i) => (this.lo[i] + this.hi[i]) / 2) as V3;
    this.azimuth = fin(turnDeg) ? (turnDeg * Math.PI) / 180 : 0;
    this.start.azimuth = this.azimuth;
    this.fit = this.fitDistance();
    this.distance = this.fit;
    this.start = { azimuth: this.azimuth, polar: this.polar, distance: this.distance, target: [...this.target] };
  }

  /**
   * Another floor, the same way of looking: the camera keeps its azimuth and polar, and frames the new bounds (the target to their
   * centre, the distance to the one that fits them). A panel inset stays. Junk bounds change nothing.
   */
  reframe(bounds: Bounds): void {
    if (
      !(bounds && Array.isArray(bounds.min) && Array.isArray(bounds.max) && [...bounds.min, ...bounds.max].every(fin))
    )
      return;
    this.lo = [bounds.min[0], bounds.min[2], bounds.min[1]];
    this.hi = [bounds.max[0], bounds.max[2], bounds.max[1]];
    this.target = [0, 1, 2].map((i) => (this.lo[i] + this.hi[i]) / 2) as V3;
    this.fit = this.fitDistance();
    this.distance = this.fit;
    this.start.distance = this.fit;
    this.start.target = [...this.target];
  }

  /**
   * The distance at which the house's box, seen from the first view (its azimuth and polar), fills 85 % of the free part of the view
   * along the tighter axis: its eight corners are projected the way the camera does (perspective, the vertical field `fov`), not a
   * sphere round the house. The free part is the view less the panel's `left` and `right` and the toolbar's `top`. Also sets `slide`:
   * how far the picture must move (fractions of the view's width and height) so the box is centred in the free part.
   */
  private fitDistance(): number {
    const half = [0, 1, 2].map((i) => (this.hi[i] - this.lo[i]) / 2),
      radius = Math.max(100, Math.hypot(half[0], half[1], half[2]));
    if (!fin(radius)) return Infinity;
    const a = this.start.azimuth,
      p = this.start.polar,
      s = [Math.sin(p) * Math.sin(a), Math.cos(p), Math.sin(p) * Math.cos(a)],
      right = [Math.cos(a), 0, -Math.sin(a)],
      up = [
        right[1] * -s[2] - right[2] * -s[1],
        right[2] * -s[0] - right[0] * -s[2],
        right[0] * -s[1] - right[1] * -s[0],
      ],
      t = Math.tan(this.fov / 2),
      freeW = 2 * FILL * (1 - this.left - this.right),
      freeH = 2 * FILL * (1 - this.top);
    const corners: V3[] = [];
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * half[0], sy * half[1], sz * half[2]]);
    const dot = (q: number[], v: number[]) => q[0] * v[0] + q[1] * v[1] + q[2] * v[2];
    const extent = (d: number) => {
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const q of corners) {
        const depth = d - dot(q, s),
          nx = dot(q, right) / (depth * t * this.aspect),
          ny = dot(q, up) / (depth * t);
        x0 = Math.min(x0, nx);
        x1 = Math.max(x1, nx);
        y0 = Math.min(y0, ny);
        y1 = Math.max(y1, ny);
      }
      return { x0, x1, y0, y1 };
    };
    const fits = (d: number) => {
      const e = extent(d);
      return e.x1 - e.x0 <= freeW && e.y1 - e.y0 <= freeH;
    };
    // Every corner must be in front of the camera: the nearest distance is just past the box's own radius.
    let lo = radius * 1.0001,
      hi = radius * 1e4;
    if (!fits(hi)) return Infinity; // cannot happen for a finite box; never a NaN distance
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    const e = extent(hi);
    // The box's centre on the screen, against the free part's centre: the picture slides by the difference (NDC is 2 across).
    this.slide = [(this.left - this.right - (e.x0 + e.x1) / 2) / 2, -(-this.top - (e.y0 + e.y1) / 2) / 2];
    return hi;
  }

  /** The view got wider or taller: the house is framed for the new shape, and the camera keeps its zoom against that framing,
   * as `setInset` does. The fit projects the box with the aspect, so a card whose height follows each floor (a floor switch)
   * would otherwise come back to a stored camera 6 % off (UI refactor item 11). Its direction and look-at point stay. */
  setAspect(aspect: number): void {
    if (!(fin(aspect) && aspect > 0) || aspect === this.aspect) return;
    const was = this.fit;
    this.aspect = aspect;
    this.fit = this.fitDistance();
    this.start.distance = this.fit;
    if (fin(was) && was > 0 && fin(this.fit))
      this.distance = clamp(this.distance * (this.fit / was), this.fit * NEAR_FACTOR, this.fit * FAR_FACTOR);
  }

  /**
   * A panel covers `left` and `right` (fractions of the width) and the toolbar `top` (a fraction of the height): frame the house in
   * what is left. The camera backs off to fit, and `shift` and `shiftY` tell the view to slide the picture so the house is centred in
   * the free part. The distance the user has chosen is kept in proportion. Junk changes nothing; left and right together never pass
   * 0.6, nor `top` 0.4.
   */
  setInset(left: number, right: number, top = 0): void {
    if (!(fin(left) && fin(right) && fin(top) && left >= 0 && right >= 0 && top >= 0)) return;
    const total = left + right,
      k = total > 0.6 ? 0.6 / total : 1,
      l = left * k,
      r = right * k,
      tp = Math.min(top, 0.4);
    if (l === this.left && r === this.right && tp === this.top) return;
    const was = this.fit;
    this.left = l;
    this.right = r;
    this.top = tp;
    this.fit = this.fitDistance();
    this.start.distance = this.fit;
    this.distance = clamp(this.distance * (this.fit / was), this.fit * NEAR_FACTOR, this.fit * FAR_FACTOR);
  }

  /** Where the picture slides to centre the house in the free part, as a fraction of the view's width (right is positive). */
  get shift(): number {
    return this.slide[0];
  }
  /** The same, as a fraction of the view's height (down is positive). */
  get shiftY(): number {
    return this.slide[1];
  }

  /** Where the camera stands (three's frame). */
  position(): V3 {
    const s = Math.sin(this.polar) * this.distance;
    return [
      this.target[0] + s * Math.sin(this.azimuth),
      this.target[1] + Math.cos(this.polar) * this.distance,
      this.target[2] + s * Math.cos(this.azimuth),
    ];
  }

  /** A drag of `dx`, `dy` pixels: right turns the house to the right, down lifts the camera. Junk changes nothing. */
  rotate(dx: number, dy: number): void {
    if (fin(dx)) this.azimuth -= dx * ROTATE_RATE;
    if (fin(dy)) this.polar = clamp(this.polar - dy * ROTATE_RATE, MIN_POLAR, MAX_POLAR);
  }

  /** `factor` below 1 comes closer, above 1 goes back. Clamped to the house's own range; junk changes nothing. */
  zoom(factor: number): void {
    if (!(fin(factor) && factor > 0)) return;
    this.distance = clamp(this.distance * factor, this.fit * NEAR_FACTOR, this.fit * FAR_FACTOR);
  }

  /** A pan of `dx`, `dy` pixels in a view `heightPx` tall: the ground follows the pointer. The target stays over the house. */
  pan(dx: number, dy: number, heightPx: number): void {
    if (!(fin(dx) && fin(dy) && fin(heightPx) && heightPx > 0)) return;
    const perPx = (2 * this.distance * Math.tan(this.fov / 2)) / heightPx,
      sin = Math.sin(this.azimuth),
      cos = Math.cos(this.azimuth);
    // right on the ground is (cos, -sin); away from the camera is (-sin, -cos).
    this.target[0] += -dx * perPx * cos + dy * perPx * -sin;
    this.target[2] += dx * perPx * sin + dy * perPx * -cos;
    const room = (i: 0 | 2) => 0.5 * (this.hi[i] - this.lo[i]) + 100;
    this.target[0] = clamp(this.target[0], this.lo[0] - room(0), this.hi[0] + room(0));
    this.target[2] = clamp(this.target[2], this.lo[2] - room(2), this.hi[2] + room(2));
  }

  /** Back to the first view: from the south (or the plan's own turn), 50 degrees up, the whole house framed. */
  reset(): void {
    this.azimuth = this.start.azimuth;
    this.polar = this.start.polar;
    this.distance = this.start.distance;
    this.target = [...this.start.target];
  }

  /** The camera as numbers a floor can be left with and found again by (S14.4): where it looks from, the distance as a
   * multiple of the one that frames the floor, and the look-at point's offset from the floor's centre. None of them
   * depends on the size of the view, so a restore in a differently shaped card still frames the same. */
  state(): { az: number; polar: number; zoom: number; dx: number; dz: number } {
    return {
      az: this.azimuth,
      polar: this.polar,
      zoom: this.distance / this.fit,
      dx: this.target[0] - (this.lo[0] + this.hi[0]) / 2,
      dz: this.target[2] - (this.lo[2] + this.hi[2]) / 2,
    };
  }

  /** The inverse of `state`, for a camera someone stored: untrusted, so each number is bounded the way a drag, a wheel turn
   * and a pan bound theirs, and anything that is not five finite numbers changes nothing. */
  restore(s: { az: number; polar: number; zoom: number; dx: number; dz: number }): void {
    if (!s || typeof s !== "object" || ![s.az, s.polar, s.zoom, s.dx, s.dz].every(fin)) return;
    this.azimuth = s.az;
    this.polar = clamp(s.polar, MIN_POLAR, MAX_POLAR);
    this.distance = clamp(s.zoom * this.fit, this.fit * NEAR_FACTOR, this.fit * FAR_FACTOR);
    const at = (i: 0 | 2, d: number) => {
      const centre = (this.lo[i] + this.hi[i]) / 2,
        room = 0.5 * (this.hi[i] - this.lo[i]) + 100;
      return clamp(centre + d, this.lo[i] - room, this.hi[i] + room);
    };
    this.target = [at(0, s.dx), (this.lo[1] + this.hi[1]) / 2, at(2, s.dz)];
  }

  /** Whether the camera has a position at all: false when the bounds are so large that the distance overflowed (the view then falls back to 2D). */
  get finite(): boolean {
    return [this.distance, this.fit, ...this.target].every(fin);
  }

  /** The distance that frames the house, for the near and far planes. */
  get framing(): number {
    return this.fit;
  }
  /** The size of the scene's frame, for the camera's far plane. */
  get radius(): number {
    return Math.max(100, 0.5 * Math.hypot(this.hi[0] - this.lo[0], this.hi[1] - this.lo[1], this.hi[2] - this.lo[2]));
  }
}
