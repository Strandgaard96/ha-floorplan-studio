import { describe, expect, it } from "vitest";
import { Orbit, MAX_POLAR, MIN_POLAR } from "../../src/card/three/orbit";
import { project } from "../../src/card/three/frame3d";

// The camera maths of the 3D view, with no WebGL: where the camera stands and what a drag, a wheel turn and a pan do.

const bounds = { min: [0, 0, 0] as [number, number, number], max: [1000, 800, 250] as [number, number, number] };
const make = (aspect = 1.5, deg = 0) => new Orbit(bounds, aspect, 40, deg);

describe("Orbit", () => {
  it("starts south of the house, 50 degrees above the horizon, looking at its centre", () => {
    const o = make(), p = o.position(), t = o.target;
    expect(t).toEqual([500, 125, 400]); // three's frame: plan (500, 400), half the height
    expect(p[0]).toBeCloseTo(500, 6); // straight south: no east-west offset
    expect(p[2]).toBeGreaterThan(t[2]); // south is +z
    const elev = Math.atan2(p[1] - t[1], Math.hypot(p[0] - t[0], p[2] - t[2]));
    expect((elev * 180) / Math.PI).toBeCloseTo(50, 6);
  });

  it("frames the whole house: the distance grows with the house and shrinks with a wider view", () => {
    const small = new Orbit({ min: [0, 0, 0], max: [100, 100, 100] }, 1.5, 40, 0).distance;
    expect(make().distance).toBeGreaterThan(small);
    expect(make(0.5).distance).toBeGreaterThan(make(2).distance); // a tall narrow view must back off to fit the width
  });

  it("a plan turned by +90 degrees starts with the camera east of the house (the plan reads turned clockwise)", () => {
    const o = make(1.5, 90), p = o.position();
    expect(p[0] - o.target[0]).toBeGreaterThan(o.distance * 0.5);
    expect(Math.abs(p[2] - o.target[2])).toBeLessThan(1e-6 * o.distance + 1e-3);
  });

  it("dragging sideways turns the azimuth and never changes the polar angle", () => {
    const o = make(), a = o.azimuth, p = o.polar;
    o.rotate(100, 0);
    expect(o.azimuth).not.toBeCloseTo(a, 3);
    expect(o.polar).toBeCloseTo(p, 9);
  });

  it("the polar angle is clamped: you cannot go under the floor, and you cannot flip over the top", () => {
    const o = make();
    o.rotate(0, 100000); // dragging down lifts the camera, as in every orbit control
    expect(o.polar).toBe(MIN_POLAR);
    o.rotate(0, -100000);
    expect(o.polar).toBe(MAX_POLAR);
    expect(MAX_POLAR).toBeLessThan(Math.PI / 2); // the camera stays above the floor plane
    expect(o.position()[1]).toBeGreaterThan(o.target[1]);
  });

  it("zoom is clamped on both sides, and a non-finite factor changes nothing", () => {
    const o = make(), d = o.distance;
    o.zoom(1e-9);
    const near = o.distance;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(d);
    o.zoom(1e12);
    const far = o.distance;
    expect(far).toBeGreaterThan(d);
    o.zoom(NaN); o.zoom(Infinity);
    expect(o.distance).toBe(far);
    o.rotate(NaN, NaN);
    expect(Number.isFinite(o.azimuth) && Number.isFinite(o.polar)).toBe(true);
  });

  it("pan moves the target along the ground (never up), by a bigger step the further out the camera is", () => {
    const o = make(), t0 = [...o.target];
    o.pan(60, 0, 600);
    expect(o.target[1]).toBe(t0[1]);
    expect(Math.hypot(o.target[0] - t0[0], o.target[2] - t0[2])).toBeGreaterThan(0);
    const near = make(); near.zoom(0.2);
    const far = make(); far.zoom(3);
    near.pan(60, 0, 600); far.pan(60, 0, 600);
    expect(Math.abs(far.target[0] - 500) + Math.abs(far.target[2] - 400)).toBeGreaterThan(Math.abs(near.target[0] - 500) + Math.abs(near.target[2] - 400));
  });

  it("pan cannot carry the target away from the house", () => {
    const o = make();
    o.pan(1e9, 1e9, 600);
    expect(Math.abs(o.target[0] - 500)).toBeLessThan(5000);
    expect(Math.abs(o.target[2] - 400)).toBeLessThan(5000);
  });

  it("empty or hostile bounds still give a camera that looks at a finite point", () => {
    const o = new Orbit({ min: [0, 0, 0], max: [0, 0, 0] }, 1, 40, 0);
    expect(o.position().every(Number.isFinite)).toBe(true);
    const n = new Orbit({ min: [NaN, 0, 0], max: [Infinity, 0, 0] } as never, NaN, NaN, NaN);
    expect(n.position().every(Number.isFinite)).toBe(true);
  });

  it("reset puts the camera back where it started", () => {
    const o = make(1.5, 45), p = o.position();
    o.rotate(300, 80); o.zoom(2); o.pan(40, 40, 600);
    o.reset();
    expect(o.position().map((v) => Math.round(v * 1e6) / 1e6)).toEqual(p.map((v) => Math.round(v * 1e6) / 1e6));
  });

  it("MIN_POLAR and MAX_POLAR are in range", () => {
    expect(MIN_POLAR).toBeGreaterThan(0);
    expect(MIN_POLAR).toBeLessThan(MAX_POLAR);
  });
});

const NO_COVER = { top: 0, right: 0, bottom: 0, left: 0 };
const cover = (bottom: number) => ({ top: 0, right: 0, bottom, left: 0 });
/** The eight corners of plan bounds, on the canvas, through the orbit's own camera (frame3d's `project`, checked against three in three-frame3d.test.ts). */
const screen = (o: Orbit, b: { min: number[]; max: number[] }, canvas: { w: number; h: number }) => {
  const pts: { x: number; y: number }[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    // plan (x, y, z up) to three (x, z, y)
    const q = project([x, z, y], canvas, { az: o.azimuth, polar: o.polar, distance: o.distance, target: o.target }, 40, o.shift);
    if (!q) throw new Error("a corner is behind the camera");
    pts.push(q);
  }
  return { left: Math.min(...pts.map((p) => p.x)), right: Math.max(...pts.map((p) => p.x)), top: Math.min(...pts.map((p) => p.y)), bottom: Math.max(...pts.map((p) => p.y)) };
};
const C1 = { w: 1000, h: 700 }, C2 = { w: 700, h: 1000 };
const framedAt = (c = C1, cv = NO_COVER, deg = 0) => { const o = make(c.w / c.h, deg); o.setVisible(c, cv); return o; };
const room = { min: [100, 100, 0] as [number, number, number], max: [400, 350, 250] as [number, number, number] };
const near = (a: number[], b: number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

describe("Orbit frames a box (S32.4)", () => {
  it("the start frames the floor box exactly: tight on one side of the visible box, inside on the other", () => {
    const o = framedAt(), r = screen(o, bounds, C1), m = Math.max(12, 0.05 * 700);
    expect(r.left).toBeGreaterThanOrEqual(m - 0.5);
    expect(r.right).toBeLessThanOrEqual(C1.w - m + 0.5);
    expect(r.top).toBeGreaterThanOrEqual(m - 0.5);
    expect(r.bottom).toBeLessThanOrEqual(C1.h - m + 0.5);
    const slack = Math.min(r.left - m, C1.w - m - r.right, r.top - m, C1.h - m - r.bottom);
    expect(slack).toBeLessThan(0.5); // tight on at least one side, the old 0.85 sphere was not
  });

  it("a cover at the bottom frames the box above it, its centre on the visible box's centre", () => {
    const o = framedAt(C2, cover(400)), r = screen(o, bounds, C2);
    expect(r.bottom).toBeLessThanOrEqual(600 + 0.5);
    // S32.4 revision with fitBox: the corners' extent (not the box's own centre) is centred on the visible box, 700 x 600 here
    expect((r.left + r.right) / 2).toBeCloseTo(350, 0);
    expect((r.top + r.bottom) / 2).toBeCloseTo(300, 0);
    expect(o.shift[1]).toBeLessThan(0); // and the picture went up
    const wide = framedAt(C1), low = framedAt(C1, cover(300)); // 400 px left and the height binds: further back
    expect(low.distance).toBeGreaterThan(wide.distance);
  });

  it("frameTo a room fits that box at the current angles and moves the target to its centre", () => {
    const o = framedAt(), az = o.azimuth, polar = o.polar;
    o.rotate(40, 10);
    const [a2, p2] = [o.azimuth, o.polar];
    expect(a2).not.toBe(az); expect(p2).not.toBe(polar);
    expect(o.frameTo(room)).toBe(true);
    expect(o.azimuth).toBe(a2); expect(o.polar).toBe(p2);
    near(o.target, [250, 125, 225]); // three: plan (250, 225), half the 250 height
    const r = screen(o, room, C1);
    expect(r.left).toBeGreaterThan(0); expect(r.right).toBeLessThan(C1.w); expect(r.top).toBeGreaterThan(0); expect(r.bottom).toBeLessThan(C1.h);
    expect(o.distance).toBeLessThan(framedAt().distance); // a room is closer than the house
  });

  it("a tiny box is held at the near limit and its extent is still centred on the visible box (the shift follows the clamped distance)", () => {
    // Opus review: refit clamped the distance but kept the shift computed for the unclamped one, so the picture sat off-centre.
    const o = framedAt(C1, cover(300)), unit = o.distance;
    const tiny = { min: [300, 300, 0] as [number, number, number], max: [310, 310, 10] as [number, number, number] };
    expect(o.frameTo(tiny)).toBe(true);
    expect(o.distance, "held at the near limit, 0.15 of the unit").toBeCloseTo(unit * 0.15, 6);
    const r = screen(o, tiny, C1); // the visible box is 1000 x 400 here: its centre is (500, 200)
    expect((r.left + r.right) / 2).toBeCloseTo(500, 0);
    expect((r.top + r.bottom) / 2).toBeCloseTo(200, 0);
  });

  it("frameTo junk changes nothing and says so", () => {
    const o = framedAt(), d = o.distance, t = [...o.target];
    for (const junk of [null, undefined, 3, { min: [NaN, 0, 0], max: [1, 1, 1] }, { min: [5, 5, 5], max: [1, 1, 1] }, { min: [0, 0], max: [1, 1] }] as never[]) expect(o.frameTo(junk)).toBe(false);
    expect(o.distance).toBe(d);
    expect(o.target).toEqual(t);
  });

  it("framing again with no box is the floor", () => {
    const o = framedAt(); const d = o.distance;
    o.frameTo(room);
    o.frameFloor();
    expect(o.distance).toBeCloseTo(d, 6);
    near(o.target, [500, 125, 400]);
  });
});

describe("Orbit setVisible, F1 (S32.4)", () => {
  it("a framed camera is fitted again to the new box: the same as a fresh orbit there", () => {
    const o = framedAt(C1); o.setVisible(C2, NO_COVER);
    const fresh = framedAt(C2);
    expect(o.distance).toBeCloseTo(fresh.distance, 6);
    near(o.target, fresh.target);
    expect(o.shift).toEqual(fresh.shift);
    const r = screen(o, bounds, C2);
    expect(Math.min(r.left, C2.w - r.right, r.top, C2.h - r.bottom)).toBeGreaterThan(11.5);
  });

  it("a framed camera that has turned is fitted again at its own angles", () => {
    const o = framedAt(C1, NO_COVER, 45); // a plan turned 45 degrees is still framed: it is the start
    o.setVisible(C2, NO_COVER);
    expect(o.azimuth).toBeCloseTo(Math.PI / 4, 9);
    const r = screen(o, bounds, C2);
    expect(Math.min(r.left, C2.w - r.right, r.top, C2.h - r.bottom)).toBeGreaterThan(11.5);
  });

  it("a moved camera keeps angles and target; the distance follows the unit; the zoom multiple is unchanged", () => {
    const o = framedAt(C1);
    o.rotate(-130, 20); o.zoom(0.6); o.pan(90, -30, 600);
    const was = { az: o.azimuth, polar: o.polar, t: [...o.target], d: o.distance, st: o.state(), u: o.framing };
    o.setVisible(C2, NO_COVER);
    expect(o.azimuth).toBe(was.az); expect(o.polar).toBe(was.polar);
    expect(o.target).toEqual(was.t);
    expect(o.framing).not.toBeCloseTo(was.u, 3);
    expect(o.distance).toBeCloseTo(was.d * (o.framing / was.u), 6);
    expect(o.state().zoom).toBeCloseTo(was.st.zoom, 6);
    expect(o.state().dx).toBeCloseTo(was.st.dx, 6);
    expect(o.shift).toEqual([0, 0]); // a moved camera's target stays on the visible centre (no cover here)
  });

  for (const [name, move] of [["rotate", (o: Orbit) => o.rotate(30, 0)], ["zoom", (o: Orbit) => o.zoom(0.8)], ["pan", (o: Orbit) => o.pan(20, 0, 600)]] as const) {
    it(`any ${name} makes the camera moved: a resize no longer fits it again`, () => {
      const o = framedAt(C1); move(o);
      const t = [...o.target], d = o.distance, u = o.framing;
      o.setVisible(C2, NO_COVER);
      expect(o.target).toEqual(t);
      expect(o.distance).toBeCloseTo(d * (o.framing / u), 6);
      const refit = framedAt(C2); move(refit); refit.frameFloor(); // what a framed camera would do: fit again at these angles
      expect(o.distance !== refit.distance || o.target.some((v, i) => v !== refit.target[i])).toBe(true);
    });
  }

  it("a restored camera is not framed: a resize keeps its zoom multiple", () => {
    const o = framedAt(C1);
    o.restore({ az: 0.4, polar: 0.9, zoom: 0.5, dx: 30, dz: -20 });
    o.setVisible(C2, NO_COVER);
    expect(o.state().zoom).toBeCloseTo(0.5, 6);
    near([o.state().dx, o.state().dz], [30, -20]);
    expect(o.azimuth).toBeCloseTo(0.4, 9);
  });

  it("a visible box under 120 px wide or high is ignored; a change of 1 px or less is too", () => {
    const o = framedAt(C2, cover(100));
    const d = o.distance, sh = [...o.shift];
    o.setVisible(C2, cover(C2.h - 100)); // 100 px high: the sheet at full
    expect(o.distance).toBe(d); expect(o.shift).toEqual(sh);
    o.setVisible({ w: 110, h: 1000 }, NO_COVER);
    expect(o.distance).toBe(d);
    o.setVisible(C2, cover(100.9));
    expect(o.distance).toBe(d); expect(o.shift).toEqual(sh);
    o.setVisible(C2, cover(102));
    expect(o.shift[1]).not.toBe(sh[1]); // the width binds here, so only the slide moves
  });

  it("back from an ignored box fits the full stage again, as the first draw did", () => {
    const o = framedAt(C1), first = o.distance;
    o.setVisible(C1, cover(300)); // 400 px left: the height binds
    expect(o.distance).toBeGreaterThan(first);
    o.setVisible(C1, cover(C1.h - 50));
    o.setVisible(C1, NO_COVER);
    expect(o.distance).toBeCloseTo(first, 6);
  });

  it("junk changes nothing and never throws", () => {
    const o = framedAt(C1), d = o.distance, sh = [...o.shift];
    for (const [c, cv] of [[{ w: NaN, h: 5 }, NO_COVER], [{ w: 0, h: 0 }, NO_COVER], [null, NO_COVER], [C2, null], [C2, { top: NaN, right: 0, bottom: 0, left: 0 }], [C2, cover(Infinity)], [{ w: -3, h: 1000 }, NO_COVER]] as never[][]) {
      expect(() => o.setVisible(c as never, cv as never)).not.toThrow();
    }
    expect(o.distance).toBe(d); expect(o.shift).toEqual(sh);
    // a cover beyond the stage is clamped (nothing is left to see: ignored)
    o.setVisible(C1, cover(1e9));
    expect(o.distance).toBe(d);
  });
});

describe("Orbit focus and unfocus (S32.4)", () => {
  it("focus frames the room; unfocus returns the pre-focus distance and target", () => {
    const o = framedAt(); o.zoom(0.7); o.pan(30, 10, 600);
    const d = o.distance, t = [...o.target];
    expect(o.focus(room)).toBe(true);
    near(o.target, [250, 125, 225]);
    expect(o.distance).not.toBeCloseTo(d, 0);
    o.unfocus();
    expect(o.distance).toBeCloseTo(d, 6);
    near(o.target, t);
  });

  it("a second focus keeps the first pre-focus camera", () => {
    const o = framedAt(), d = o.distance, t = [...o.target];
    o.focus(room);
    o.focus({ min: [600, 400, 0], max: [900, 700, 250] });
    o.unfocus();
    expect(o.distance).toBeCloseTo(d, 6);
    near(o.target, t);
  });

  it("while focused, state is the floor camera with the angles the person has now", () => {
    const o = framedAt(); o.zoom(0.7); o.pan(30, 10, 600);
    const before = o.state();
    o.focus(room);
    o.rotate(60, 15);
    const s = o.state();
    expect(s.az).toBeCloseTo(o.azimuth, 10); expect(s.polar).toBeCloseTo(o.polar, 10);
    expect(s.az).not.toBeCloseTo(before.az, 3);
    expect(s.zoom).toBeCloseTo(before.zoom, 6);
    expect(s.dx).toBeCloseTo(before.dx, 6); expect(s.dz).toBeCloseTo(before.dz, 6);
    o.unfocus();
    expect(o.azimuth).toBeCloseTo(s.az, 10); // unfocus keeps the current angles
    expect(o.state().zoom).toBeCloseTo(before.zoom, 6);
  });

  it("a framed pre-focus camera is framed again after unfocus; a moved one stays moved", () => {
    const a = framedAt(C1); a.focus(room); a.unfocus(); a.setVisible(C2, NO_COVER);
    expect(a.distance).toBeCloseTo(framedAt(C2).distance, 6);
    const b = framedAt(C1); b.zoom(0.7); b.focus(room); b.unfocus(); const z = b.state().zoom; b.setVisible(C2, NO_COVER);
    expect(b.state().zoom).toBeCloseTo(z, 6);
  });

  it("a focused camera is framed: a resize fits the room again; once moved, the distance follows the unit", () => {
    const o = framedAt(C1); o.focus(room); o.setVisible(C2, NO_COVER);
    const fresh = framedAt(C2); fresh.focus(room);
    expect(o.distance).toBeCloseTo(fresh.distance, 6);
    o.rotate(20, 0);
    const d = o.distance, u = o.framing;
    o.setVisible(C1, NO_COVER);
    expect(o.distance).toBeCloseTo(d * (o.framing / u), 6);
    o.unfocus(); // the pre-focus zoom follows the unit too: nothing jumps
    expect(o.state().zoom).toBeCloseTo(1, 6);
  });

  it("reset, reframe and restore drop the focus", () => {
    const o = framedAt(); o.focus(room); o.rotate(40, 5); o.reset();
    near(o.target, [500, 125, 400]); expect(o.state().zoom).toBeCloseTo(1, 6);
    o.focus(room); o.reframe({ min: [0, 0, 0], max: [300, 300, 250] });
    near(o.target, [150, 125, 150]);
    o.focus(room); o.restore({ az: 0, polar: 0.8, zoom: 0.5, dx: 0, dz: 0 });
    expect(o.state().zoom).toBeCloseTo(0.5, 6);
    o.unfocus(); // nothing to go back to: no change
    expect(o.state().zoom).toBeCloseTo(0.5, 6);
  });

  it("unfocus with no focus changes nothing", () => {
    const o = framedAt(); o.rotate(10, 10); const d = o.distance, t = [...o.target];
    o.unfocus();
    expect(o.distance).toBe(d); expect(o.target).toEqual(t);
  });
});

describe("Orbit reframe: another floor, the same way of looking (S12.6)", () => {
  const small = { min: [0, 0, -300] as [number, number, number], max: [200, 100, 250] as [number, number, number] };
  it("keeps azimuth and polar, frames the new bounds, and what reset returns to is the new frame", () => {
    const o = make(1.5, 20);
    o.rotate(-100, 40);
    o.zoom(0.5);
    o.pan(30, 30, 800);
    const [az, polar] = [o.azimuth, o.polar];
    const fresh = new Orbit(small, 1.5, 40, 20);
    fresh.rotate(-100, 40); fresh.frameFloor(); // the same angles: a floor switch frames at the way of looking the person has
    const atStart = new Orbit(small, 1.5, 40, 20);
    o.reframe(small);
    expect(o.azimuth).toBe(az);
    expect(o.polar).toBe(polar);
    expect(o.distance).toBeCloseTo(fresh.distance, 6);
    expect(o.target).toEqual(fresh.target);
    expect(o.framing).toBeCloseTo(fresh.framing, 6);
    o.rotate(50, 50);
    o.reset();
    expect(o.distance).toBeCloseTo(atStart.distance, 6); // back to the new floor's frame, with the first azimuth
    expect(o.target).toEqual(atStart.target);
  });
  it("keeps the visible box (the cover), and junk bounds change nothing", () => {
    const o = make();
    o.setVisible(C2, cover(300));
    const fresh = new Orbit(small, 0.7, 40, 0);
    fresh.setVisible(C2, cover(300));
    o.reframe(small);
    expect(o.distance).toBeCloseTo(fresh.distance, 6);
    const d = o.distance, t = [...o.target];
    o.reframe({ min: [NaN, 0, 0], max: [1, 1, Infinity] } as never);
    o.reframe(null as never);
    expect(o.distance).toBe(d);
    expect(o.target).toEqual(t);
  });
});

describe("Orbit with numbers too large for a camera", () => {
  it("says it has no finite position when the bounds overflow the framing distance", () => {
    const huge = { min: [-1.7e308, 0, 0] as [number, number, number], max: [1.7e308, 800, 250] as [number, number, number] };
    expect(new Orbit(huge, 1.5, 40, 0).finite).toBe(false);
    expect(make().finite).toBe(true);
  });
});

describe("Orbit state and restore: the camera a floor is left with (S14.4)", () => {
  /** A camera the user has moved on all four axes, with asymmetric numbers. */
  const moved = () => { const o = make(); o.rotate(-130, 40); o.zoom(0.6); o.pan(90, -30, 600); return o; };

  it("state is the camera as numbers that survive another size of view: the distance as a multiple of the framing one", () => {
    const o = moved(), s = o.state();
    expect(s.az).toBeCloseTo(o.azimuth, 10);
    expect(s.polar).toBeCloseTo(o.polar, 10);
    expect(s.zoom).toBeCloseTo(o.distance / o.framing, 10);
    expect(s.dx).toBeCloseTo(o.target[0] - 500, 6); // the centre of the 1000 x 800 house
    expect(s.dz).toBeCloseTo(o.target[2] - 400, 6);
  });

  it("restore puts a fresh camera exactly where the old one stood", () => {
    const a = moved(), s = a.state(), b = make();
    b.restore(s);
    expect(b.azimuth).toBeCloseTo(a.azimuth, 10);
    expect(b.polar).toBeCloseTo(a.polar, 10);
    expect(b.distance).toBeCloseTo(a.distance, 6);
    expect(b.target[0]).toBeCloseTo(a.target[0], 6);
    expect(b.target[2]).toBeCloseTo(a.target[2], 6);
    expect(b.target[1]).toBeCloseTo(a.target[1], 6); // pan never lifts the target
  });

  it("restore on another floor keeps the way of looking and the offset, in that floor's own frame", () => {
    const small = { min: [0, 0, 0] as [number, number, number], max: [400, 300, 250] as [number, number, number] };
    const b = new Orbit(small, 1.5, 40, 0);
    b.restore({ az: 0.7, polar: 0.9, zoom: 0.5, dx: 20, dz: -10 });
    expect(b.distance).toBeCloseTo(b.framing * 0.5, 6);
    expect(b.target[0]).toBeCloseTo(220, 6);
    expect(b.target[2]).toBeCloseTo(140, 6);
  });

  it("restore after the view changed size lands at the same multiple of the framing distance", () => {
    const o = make(1.5);
    o.restore({ az: 0, polar: 0.8, zoom: 0.5, dx: 0, dz: 0 });
    o.setVisible(C2, NO_COVER);
    expect(o.state().zoom).toBeCloseTo(0.5, 6); // a restored camera is moved: its multiple of the unit survives the new shape
    expect(o.state().zoom).toBeCloseTo(o.distance / o.framing, 10); // read against the new framing
    const p = make(0.7); p.setVisible(C2, NO_COVER);
    p.restore(o.state());
    expect(p.distance).toBeCloseTo(o.distance, 6);
  });

  it("restore bounds what it is given: polar, distance and the offset stay inside what the camera allows; junk changes nothing", () => {
    const o = make();
    o.restore({ az: 0, polar: 99, zoom: 99, dx: 1e9, dz: -1e9 });
    expect(o.polar).toBe(MAX_POLAR);
    expect(o.distance).toBeCloseTo(o.framing * 4, 6);
    expect(o.target[0]).toBeCloseTo(1000 + 500 + 100, 6); // the same limit a pan has: half the house and 100 cm past its edge
    expect(o.target[2]).toBeCloseTo(0 - 400 - 100, 6);
    const before = o.state();
    for (const junk of [null, undefined, 7, "x", { az: NaN, polar: 1, zoom: 1, dx: 0, dz: 0 }, { az: 1 }] as never[]) o.restore(junk);
    expect(o.state()).toEqual(before);
  });

  it("reset still goes to the first view after a restore", () => {
    const o = make();
    const first = o.state();
    o.restore({ az: 2, polar: 1, zoom: 0.3, dx: 100, dz: 100 });
    o.reset();
    expect(o.state()).toEqual(first);
  });
});
