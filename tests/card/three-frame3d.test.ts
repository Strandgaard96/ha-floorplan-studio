import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { fitBox, glide, project, type Box, type Cam } from "../../src/card/three/frame3d";

// Criterion 10 of docs/specs/card-3d-framing.md: the pure framing maths agrees with three itself. All points are in
// three's frame (x east, y up, z south), as the Orbit keeps them.

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Three's own answer: a camera set up the way view3d's `prepare` does it, with the lens shift as `setViewOffset`. */
function threeProject(p: [number, number, number], cam: Cam, fov: number, w: number, h: number, shift: [number, number]) {
  const c = new PerspectiveCamera(fov, w / h, 1, 1e6);
  const s = Math.sin(cam.polar) * cam.distance;
  c.position.set(cam.target[0] + s * Math.sin(cam.az), cam.target[1] + Math.cos(cam.polar) * cam.distance, cam.target[2] + s * Math.cos(cam.az));
  c.lookAt(cam.target[0], cam.target[1], cam.target[2]);
  // The picture moves by `shift` px: the frustum's window moves the other way.
  c.setViewOffset(w, h, -shift[0], -shift[1], w, h);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  const v = new Vector3(...p).project(c);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

const corners = (b: Box): [number, number, number][] => {
  const o: [number, number, number][] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) o.push([x, y, z]);
  return o;
};

interface Case { box: Box; az: number; polar: number; fov: number; w: number; h: number; vis: { left: number; top: number; right: number; bottom: number } }
function makeCase(r: () => number): Case {
  const x0 = between(r, -500, 500), y0 = between(r, 0, 50), z0 = between(r, -500, 500);
  const box: Box = { min: [x0, y0, z0], max: [x0 + between(r, 100, 2000), y0 + between(r, 50, 400), z0 + between(r, 100, 2000)] };
  const w = between(r, 300, 1400), h = between(r, 300, 1200);
  const left = between(r, 0, w * 0.2), top = between(r, 0, h * 0.2);
  return {
    box, az: between(r, -Math.PI, Math.PI), polar: between(r, 0.1, 1.45), fov: between(r, 25, 60), w, h,
    vis: { left, top, right: w - between(r, 0, w * 0.2), bottom: h - between(r, 0, h * 0.45) },
  };
}

describe("project", () => {
  it("agrees with three's PerspectiveCamera plus setViewOffset within 0.01 px over 500 seeded cases", () => {
    const r = rng(7);
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const k = makeCase(r);
      const cam: Cam = { az: k.az, polar: k.polar, distance: between(r, 1500, 6000), target: [between(r, -300, 300), between(r, 0, 200), between(r, -300, 300)] };
      const shift: [number, number] = [between(r, -150, 150), between(r, -250, 250)];
      const p: [number, number, number] = [cam.target[0] + between(r, -600, 600), between(r, 0, 300), cam.target[2] + between(r, -600, 600)];
      const mine = project(p, { w: k.w, h: k.h }, cam, k.fov, shift), ref = threeProject(p, cam, k.fov, k.w, k.h, shift);
      expect(mine).not.toBeNull();
      worst = Math.max(worst, Math.hypot(mine!.x - ref.x, mine!.y - ref.y));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("moves the picture right and down for a positive shift (pins the lens sign)", () => {
    const cam: Cam = { az: 0.4, polar: 0.9, distance: 2000, target: [0, 0, 0] };
    const a = project([0, 0, 0], { w: 800, h: 600 }, cam, 40, [0, 0])!, b = project([0, 0, 0], { w: 800, h: 600 }, cam, 40, [30, 20])!;
    expect(a).toEqual({ x: 400, y: 300 });
    expect(b.x).toBeCloseTo(430, 6);
    expect(b.y).toBeCloseTo(320, 6);
  });

  it("returns null for a point behind the camera and for junk, never throws", () => {
    const cam: Cam = { az: 0, polar: 0.9, distance: 100, target: [0, 0, 0] };
    expect(project([0, 0, 5000], { w: 800, h: 600 }, cam, 40, [0, 0])).toBeNull(); // behind: camera is south at +z
    expect(project([NaN, 0, 0], { w: 800, h: 600 }, cam, 40, [0, 0])).toBeNull();
    expect(project([0, 0, 0], { w: 0, h: 600 }, cam, 40, [0, 0])).toBeNull();
    expect(project([0, 0, 0], { w: 800, h: 600 }, { ...cam, distance: -1 }, 40, [0, 0])).toBeNull();
    expect(project([0, 0, 0], { w: 800, h: 600 }, cam, 40, [Infinity, 0])).toBeNull();
    expect(project(null as never, null as never, null as never, 40, null as never)).toBeNull();
  });
});

describe("fitBox", () => {
  const extent = (k: Case, f: NonNullable<ReturnType<typeof fitBox>>) => {
    const cam: Cam = { az: k.az, polar: k.polar, distance: f.distance, target: f.target };
    const pts = corners(k.box).map((c) => project(c, { w: k.w, h: k.h }, cam, k.fov, f.shift)!);
    expect(pts.every((p) => p !== null)).toBe(true);
    const m = Math.max(12, 0.05 * Math.min(k.vis.right - k.vis.left, k.vis.bottom - k.vis.top));
    return {
      pts, m,
      slackL: Math.min(...pts.map((p) => p.x)) - (k.vis.left + m), slackR: k.vis.right - m - Math.max(...pts.map((p) => p.x)),
      slackT: Math.min(...pts.map((p) => p.y)) - (k.vis.top + m), slackB: k.vis.bottom - m - Math.max(...pts.map((p) => p.y)),
    };
  };

  it("is inside the margin on every side, tight on one, and the extent is centred on the visible box, over 500 seeded cases", () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const k = makeCase(r), f = fitBox(k.box, k.az, k.polar, k.fov, { w: k.w, h: k.h }, k.vis);
      expect(f).not.toBeNull();
      const e = extent(k, f!);
      const slacks = [e.slackL, e.slackR, e.slackT, e.slackB];
      for (const s of slacks) expect(s).toBeGreaterThan(-0.5);
      expect(Math.min(...slacks)).toBeLessThan(0.5);
      // S32.4 revision: equal slack on opposite sides, so the projected extent (not the box's own centre) sits on the visible centre.
      expect(Math.abs(e.slackL - e.slackR)).toBeLessThan(0.5);
      expect(Math.abs(e.slackT - e.slackB)).toBeLessThan(0.5);
    }
  });

  it("looks at the box centre and centres the projected extent on the visible box (lower half covered)", () => {
    const box: Box = { min: [0, 0, 0], max: [1000, 250, 800] };
    const w = 390, h = 700, vis = { left: 0, top: 0, right: 390, bottom: 350 }; // the sheet covers the lower half
    const f = fitBox(box, 0.3, 0.9, 40, { w, h }, vis)!;
    expect(f.target).toEqual([500, 125, 400]); // the camera still looks at the box's centre
    const cam: Cam = { az: 0.3, polar: 0.9, distance: f.distance, target: f.target };
    const pts = corners(box).map((c) => project(c, { w, h }, cam, 40, f.shift)!);
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2, cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
    expect(cx).toBeCloseTo(195, 6);
    expect(cy).toBeCloseTo(175, 6);
    // The old premise (S32.2) put the box's own centre on the visible centre. From 0.9 rad the near side is drawn larger, so the
    // two differ by pixels: the box's centre is NOT on the visible centre any more, the extent is.
    const c = project(f.target, { w, h }, cam, 40, f.shift)!;
    expect(Math.abs(c.y - 175)).toBeGreaterThan(2);
    // And three agrees about where the extent stands.
    const t = corners(box).map((p) => threeProject(p, cam, 40, w, h, f.shift));
    expect((Math.min(...t.map((p) => p.y)) + Math.max(...t.map((p) => p.y))) / 2).toBeCloseTo(175, 6);
  });

  it("a smaller visible box needs a farther camera", () => {
    const box: Box = { min: [0, 0, 0], max: [1000, 250, 800] };
    const big = fitBox(box, 0, 0.9, 40, { w: 800, h: 600 }, { left: 0, top: 0, right: 800, bottom: 600 })!;
    const small = fitBox(box, 0, 0.9, 40, { w: 800, h: 600 }, { left: 0, top: 0, right: 400, bottom: 300 })!;
    expect(small.distance).toBeGreaterThan(big.distance);
  });

  it("returns null or a finite answer for junk, never throws", () => {
    const box: Box = { min: [0, 0, 0], max: [1000, 250, 800] }, cv = { w: 800, h: 600 }, v = { left: 0, top: 0, right: 800, bottom: 600 };
    const nope: unknown[] = [
      fitBox({ min: [NaN, 0, 0], max: [1, 1, 1] }, 0, 0.9, 40, cv, v),
      fitBox({ min: [0, 0, 0], max: [Infinity, 1, 1] }, 0, 0.9, 40, cv, v),
      fitBox({ min: [5, 0, 0], max: [1, 1, 1] }, 0, 0.9, 40, cv, v), // inverted box
      fitBox(box, NaN, 0.9, 40, cv, v),
      fitBox(box, 0, Infinity, 40, cv, v),
      fitBox(box, 0, 0.9, NaN, cv, v),
      fitBox(box, 0, 0.9, 0, cv, v),
      fitBox(box, 0, 0.9, 40, { w: 0, h: 600 }, v),
      fitBox(box, 0, 0.9, 40, { w: -5, h: 600 }, v),
      fitBox(box, 0, 0.9, 40, cv, { left: 500, top: 0, right: 100, bottom: 600 }), // inverted visible box
      fitBox(box, 0, 0.9, 40, cv, { left: 0, top: 0, right: 5000, bottom: 600 }), // outside the canvas
      fitBox(box, 0, 0.9, 40, cv, { left: 0, top: 0, right: 20, bottom: 20 }), // margin eats it
      fitBox(box, 0, 0.9, 40, cv, { left: NaN, top: 0, right: 800, bottom: 600 }),
      fitBox(null as never, 0, 0.9, 40, cv, v),
      fitBox(box, 0, 0.9, 40, null as never, v),
      fitBox(box, 0, 0.9, 40, cv, null as never),
      fitBox({ min: [0, 0], max: [1, 1] } as never, 0, 0.9, 40, cv, v),
    ];
    for (const n of nope) expect(n).toBeNull();
    // A polar at the pole and a flat box are fine, and finite.
    for (const f of [fitBox(box, 0, 0, 40, cv, v), fitBox(box, 0, 3.2, 40, cv, v), fitBox({ min: [0, 0, 0], max: [0, 0, 0] }, 0, 0.9, 40, cv, v)]) {
      if (f) expect([f.distance, ...f.target, ...f.shift].every(Number.isFinite)).toBe(true);
    }
  });
});

describe("glide", () => {
  const a = { az: 0.5, polar: 0.8, distance: 1000, target: [0, 0, 0] as [number, number, number] };
  const b = { az: 1.5, polar: 1.0, distance: 4000, target: [100, 50, -200] as [number, number, number] };

  it("is its ends at 0 and 1 exactly", () => {
    expect(glide(a, b, 0)).toEqual(a);
    expect(glide(a, b, 1)).toEqual(b);
    expect(glide(a, b, -3)).toEqual(a);
    expect(glide(a, b, 7)).toEqual(b);
  });

  it("eases out and moves the distance on a log scale", () => {
    const m = glide(a, b, 0.5)!, e = 1 - 0.5 ** 3;
    expect(m.distance).toBeCloseTo(1000 * 4 ** e, 6);
    expect(m.az).toBeCloseTo(0.5 + e, 9);
    expect(m.target[0]).toBeCloseTo(100 * e, 9);
    expect(e).toBeGreaterThan(0.5); // out: more than half way at half time
  });

  it("turns the short way across plus or minus pi", () => {
    const from = { ...a, az: 3.0 }, to = { ...a, az: -3.0 };
    const q = glide(from, to, 0.25)!;
    expect(q.az).toBeGreaterThan(3.0); // goes up, through pi, not down through 0
    const end = glide(from, to, 1)!;
    expect(end.az).toBe(-3.0);
    for (let t = 0.05; t < 1; t += 0.05) {
      const g = glide(from, to, t)!;
      expect(Math.abs(g.az - from.az)).toBeLessThan(0.3); // total 0.283
    }
    const back = glide(to, from, 0.25)!;
    expect(back.az).toBeLessThan(-3.0);
  });

  it("returns null for junk and a finite camera otherwise, never throws", () => {
    expect(glide({ ...a, az: NaN }, b, 0.5)).toBeNull();
    expect(glide(a, { ...b, distance: Infinity }, 0.5)).toBeNull();
    expect(glide(a, { ...b, target: [0, NaN, 0] }, 0.5)).toBeNull();
    expect(glide(null as never, b, 0.5)).toBeNull();
    expect(glide(a, undefined as never, 0.5)).toBeNull();
    const nan = glide(a, b, NaN)!;
    expect(nan).toEqual(a);
    const zero = glide({ ...a, distance: 0 }, b, 0.5)!; // a log scale needs a positive distance: falls back to linear
    expect(Number.isFinite(zero.distance)).toBe(true);
  });
});
