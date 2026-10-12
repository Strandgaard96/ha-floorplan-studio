import { describe, it, expect } from "vitest";
import house from "../fixtures/hand-align-house.json";
import type { Layout, Pt } from "../../src/core/schema";
import { validate, floorPlace, floorPose, placePoint, composePlace, floorPivot } from "../../src/core";
import { FIRST_TO_GROUND, GROUND_TO_BASEMENT } from "../fixtures/hand-align-truth";
import { EditorState } from "../../src/editor/state";

// S29.6. Floors of the hand-align fixture: basement (lowest), ground (middle), first (top). No pose on any of them.
const mk = (): Layout => structuredClone(house) as unknown as Layout;
const st = (locked = false) => { const s = new EditorState(mk()); s.planLocked = locked; return s; };
const ok = (s: EditorState) => expect(validate(s.layout).ok).toBe(true);
const KEYS = Object.keys(mk().floors);
const LOWEST = KEYS[0], MIDDLE = KEYS[1];

const rotations: [string, number | undefined][] = [["absent", undefined], ["zero", 0], ["set", 4.25]];
const offsets: [string, Pt | undefined][] = [["absent", undefined], ["zero", [0, 0]], ["set", [83.5, -41.2]]];
const targets: [string, number][] = [["in range", 7.31], ["180", 180], ["-180", -180], ["359.99", 359.99], ["NaN", NaN], ["Infinity", Infinity], ["400 (wraps)", 400]];

describe("EditorState.setPose (S29.6)", () => {
  for (const [rn, r0] of rotations) for (const [on, o0] of offsets) for (const locked of [false, true])
    for (const key of [LOWEST, MIDDLE, "nope", "__proto__"]) for (const [tn, target] of targets) {
      it(`rotation ${rn}, offset ${on}, lock ${locked}, floor ${key}, to ${tn}`, () => {
        const s = st(locked);
        const known = KEYS.includes(key);
        if (known) { if (r0 !== undefined) s.layout.floors[key].rotation = r0; if (o0) s.layout.floors[key].offset = [...o0]; }
        const before = JSON.stringify(s.layout);
        const r = s.setPose(key, { rot: target, off: [137.04, -61.26] });
        if (!known || !Number.isFinite(target)) { expect(r).toBe(false); expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false); return; }
        if (locked) { expect(r).toBe(false); expect(s.planBlocked).toBe(true); expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false); return; }
        expect(r).toBe(true);
        const f = s.layout.floors[key];
        const want = ((target % 360) + 360) % 360; const wrapped = want > 180 ? want - 360 : want;
        if (wrapped === 0) expect("rotation" in f).toBe(false); else expect(f.rotation).toBeCloseTo(Math.round(wrapped * 100) / 100, 9);
        expect(f.rotation === undefined || (f.rotation > -180 && f.rotation <= 180)).toBe(true);
        expect(f.offset).toEqual([137, -61.3]); // 0.1 cm
        ok(s);
        expect(s.canUndo).toBe(true);
        s.undo();
        expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false);
      });
    }

  it("rounds the rotation to 0.01 and the offset to 0.1 cm, and deletes each key at 0", () => {
    const s = st();
    expect(s.setPose("ground", { rot: -2.504, off: [-57.04, 112.06] })).toBe(true);
    expect(s.layout.floors.ground.rotation).toBe(-2.5);
    expect(s.layout.floors.ground.offset).toEqual([-57, 112.1]);
    expect(s.setPose("ground", { rot: 0, off: [-57, 112.1] })).toBe(true);
    expect("rotation" in s.layout.floors.ground).toBe(false);
    expect(s.setPose("ground", { rot: 0, off: [0, 0] })).toBe(true);
    expect("offset" in s.layout.floors.ground).toBe(false);
    expect(Object.is(s.layout.floors.ground.offset?.[0], -0)).toBe(false);
  });

  it("no change leaves no step and no blame on the lock", () => {
    for (const locked of [false, true]) {
      const s = st(locked);
      s.layout.floors.first.rotation = 4; s.layout.floors.first.offset = [5, 6];
      expect(s.setPose("first", { rot: 4.004, off: [5.04, 6] })).toBe(false); // rounds to the stored pose
      expect(s.canUndo).toBe(false); expect(s.planBlocked).toBe(false);
      expect(s.setPose("ground", { rot: 0, off: [0, 0] })).toBe(false); // absent == zero
      expect(s.canUndo).toBe(false);
    }
  });

  it("false beyond COORD_LIMIT, junk offsets, junk poses; nothing written", () => {
    const s = st(), before = JSON.stringify(s.layout);
    for (const p of [{ rot: 0, off: [2e7, 0] }, { rot: 0, off: [NaN, 0] }, { rot: 0, off: [1] }, { rot: 0, off: "1,2" }, { rot: "3", off: [0, 0] }, null, undefined, 5, { rot: 0 }, { off: [1, 1] }])
      expect(s.setPose("first", p as never)).toBe(false);
    expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false);
  });

  it("setOffset is a wrapper: it keeps the rotation and now rounds to 0.1 cm", () => {
    const s = st(); s.layout.floors.first.rotation = 4;
    expect(s.setOffset("first", [83.04, -41.06])).toBe(true);
    expect(s.layout.floors.first.rotation).toBe(4);
    expect(s.layout.floors.first.offset).toEqual([83, -41.1]);
    expect(s.setOffset("first", [83.04, -41.06])).toBe(false);
  });

  it("addFloor copies the lowest floor's rotation with its offset", () => {
    const s = st(); s.layout.floors[LOWEST].rotation = -3.5; s.layout.floors[LOWEST].offset = [10, 20];
    const k = s.addFloor("Attic");
    expect(s.layout.floors[k].rotation).toBe(-3.5); expect(s.layout.floors[k].offset).toEqual([10, 20]);
    const t = st(); const k2 = t.addFloor("Attic2");
    expect("rotation" in t.layout.floors[k2]).toBe(false);
    ok(s); ok(t);
  });
});

// The house point of a floor's stored point c, from the stored pose.
const house_ = (s: EditorState, key: string, c: Pt): Pt => placePoint({ turn: floorPose(s.layout, key).rot, shift: floorPose(s.layout, key).off }, c);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("the session pose and its drift (S29.6)", () => {
  for (const pivot of [[12, -7], [1830, 940]] as Pt[]) {
    it(`3600 turns of +0.1 then 3600 of -0.1 about [${pivot}]`, () => {
      const s = st(); const k = "first";
      s.setPose(k, { rot: 0, off: [83, -41] });
      const start = house_(s, k, pivot);
      let worst = 0;
      for (let i = 0; i < 3600; i++) { s.turnFloor(k, 0.1, pivot); worst = Math.max(worst, dist(house_(s, k, pivot), start)); }
      expect(Math.abs(floorPose(s.layout, k).rot)).toBeLessThanOrEqual(0.01); // 360 degrees is back at 0
      for (let i = 0; i < 3600; i++) { s.turnFloor(k, -0.1, pivot); worst = Math.max(worst, dist(house_(s, k, pivot), start)); }
      const p = floorPose(s.layout, k);
      expect(Math.abs(p.rot)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(p.off[0] - 83)).toBeLessThanOrEqual(0.1); expect(Math.abs(p.off[1] + 41)).toBeLessThanOrEqual(0.1);
      expect(worst).toBeLessThanOrEqual(0.1 + 1e-9);
      ok(s);
    });
    it(`a seeded mix of all angle steps and all moves about [${pivot}]: the pivot holds, the pose returns`, () => {
      const s = st(); const k = "ground";
      s.setPose(k, { rot: -2.5, off: [-57, 112] });
      const start = house_(s, k, pivot), startPose = floorPose(s.layout, k);
      let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      const done: (() => void)[] = [];
      const steps = [0.1, 0.5, 1, 3], moves = [1, 5, 50], dirs: Pt[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 1500; i++) {
        if (rnd() < 0.5) {
          const d = steps[Math.floor(rnd() * 4)] * (rnd() < 0.5 ? 1 : -1);
          s.turnFloor(k, d, pivot); done.push(() => s.turnFloor(k, -d, pivot));
        } else {
          const dir = dirs[Math.floor(rnd() * 4)], cm = moves[Math.floor(rnd() * 3)], vt = [0, 90, -90, 180][Math.floor(rnd() * 4)];
          s.nudgeFloor(k, dir, cm, vt);
          done.push(() => s.nudgeFloor(k, [-dir[0], -dir[1]], cm, vt));
        }
      }
      for (const u of done.reverse()) u();
      const p = floorPose(s.layout, k);
      expect(Math.abs(p.rot - startPose.rot)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(p.off[0] - startPose.off[0])).toBeLessThanOrEqual(0.1);
      expect(Math.abs(p.off[1] - startPose.off[1])).toBeLessThanOrEqual(0.1);
      expect(dist(house_(s, k, pivot), start)).toBeLessThanOrEqual(0.1 + 1e-9);
      ok(s);
    });
    it(`turns alone, mixed steps: the pivot's house point is within 0.1 cm at every press, about [${pivot}]`, () => {
      const s = st(); const k = "first";
      s.setPose(k, { rot: 4, off: [83, -41] });
      const start = house_(s, k, pivot);
      let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      for (let i = 0; i < 2000; i++) {
        const d = [0.1, 0.5, 1, 3][Math.floor(rnd() * 4)] * (rnd() < 0.5 ? 1 : -1);
        s.turnFloor(k, d, pivot);
        expect(dist(house_(s, k, pivot), start)).toBeLessThanOrEqual(0.1 + 1e-9);
      }
    });
  }

  it("a nudge moves along the screen direction: view turn 0 and 90, floor turned 4 degrees", () => {
    for (const [vt, dir] of [[0, [1, 0]], [0, [0, -1]], [90, [1, 0]], [90, [0, 1]], [-90, [-1, 0]], [180, [0, 1]]] as [number, Pt][]) {
      const s = st(); s.setPose("first", { rot: 4, off: [83, -41] });
      const probe: Pt = [300, 200];
      const placeBefore = floorPlace(s.layout, "first", "ground");
      const a = placePoint(placeBefore, probe);
      expect(s.nudgeFloor("first", dir, 50, vt)).toBe(true);
      const b = placePoint(floorPlace(s.layout, "first", "ground"), probe);
      // This floor's move in its own frame, as the spec says: the screen direction turned back by the view turn.
      const a_ = (-vt * Math.PI) / 180, m: Pt = [50 * (dir[0] * Math.cos(a_) - dir[1] * Math.sin(a_)), 50 * (dir[0] * Math.sin(a_) + dir[1] * Math.cos(a_))];
      // In the frame of the floor below the point moves by R(rot_below) applied to the own-frame move turned by the floor's turn: ground has rot 0, so R(4) · m.
      const t = (4 * Math.PI) / 180;
      expect(b[0] - a[0]).toBeCloseTo(m[0] * Math.cos(t) - m[1] * Math.sin(t), 1);
      expect(b[1] - a[1]).toBeCloseTo(m[0] * Math.sin(t) + m[1] * Math.cos(t), 1);
      expect(s.canUndo).toBe(true); expect(s.layout.floors.first.rotation).toBe(4);
    }
  });

  it("at view turn 90 a press to the screen right moves the floor's own up (not its right)", () => {
    const s = st(); // no rotation anywhere
    s.nudgeFloor("first", [1, 0], 50, 90);
    expect(s.layout.floors.first.offset).toEqual([0, -50]);
    s.nudgeFloor("first", [1, 0], 50, 0);
    expect(s.layout.floors.first.offset).toEqual([50, -50]);
  });

  it("after an undo the next press starts from the stored pose, not the exact one", () => {
    const s = st(); const k = "first", c: Pt = [400, 300];
    s.setPose(k, { rot: 4, off: [83, -41] });
    s.turnFloor(k, 0.33333, c); s.turnFloor(k, 0.33333, c); // the exact pose now carries digits the store does not
    s.undo();
    const stored = floorPose(s.layout, k);
    s.turnFloor(k, 0.5, c);
    const after = floorPose(s.layout, k);
    // From the stored pose (rot 4.33, not the exact 4.6666): 4.33 + 0.5 = 4.83.
    expect(after.rot).toBeCloseTo(stored.rot + 0.5, 2);
    // Redo or any other writer also resets it: a box write, then a press, builds on the written pose.
    s.setPose(k, { rot: 10, off: [0, 0] });
    s.turnFloor(k, 1, c);
    expect(floorPose(s.layout, k).rot).toBe(11);
  });

  it("refused and no-op presses leave no step; a lock blames the lock", () => {
    const s = st(true);
    expect(s.nudgeFloor("first", [1, 0], 5, 0)).toBe(false); expect(s.planBlocked).toBe(true);
    expect(s.turnFloor("first", 1, [0, 0])).toBe(false); expect(s.planBlocked).toBe(true);
    expect(s.canUndo).toBe(false);
    const t = st();
    expect(t.turnFloor("first", 0, [0, 0])).toBe(false);
    expect(t.nudgeFloor("first", [0, 0], 5, 0)).toBe(false);
    expect(t.nudgeFloor("nope", [1, 0], 5, 0)).toBe(false);
    expect(t.turnFloor("first", NaN, [0, 0])).toBe(false);
    expect(t.turnFloor("first", 1, [NaN, 0])).toBe(false);
    expect(t.nudgeFloor("first", [1, 0], 1e9, 0)).toBe(false); // beyond COORD_LIMIT
    expect(t.canUndo).toBe(false);
  });

  it("one press is one undo step", () => {
    const s = st();
    s.turnFloor("first", 3, [10, 10]); s.nudgeFloor("first", [1, 0], 5, 0);
    s.undo(); s.undo();
    expect(s.canUndo).toBe(false);
    expect("rotation" in s.layout.floors.first).toBe(false);
  });
});

describe("Apply keeps the turn (S29.7)", () => {
  it("alignToBelow on the first floor, turned 4 degrees: the turn stays and the offset is the true shift", () => {
    const s = st(); s.layout.floors.first.rotation = 4;
    expect(s.alignToBelow("first")).toBe(true);
    const p = floorPose(s.layout, "first");
    expect(p.rot).toBe(4);
    expect(Math.abs(p.off[0] - 83)).toBeLessThan(2); expect(Math.abs(p.off[1] + 41)).toBeLessThan(2);
    expect(s.canUndo).toBe(true); ok(s);
    s.undo(); expect(s.layout.floors.first.rotation).toBe(4); expect("offset" in s.layout.floors.first).toBe(false);
  });
  it("with the floor below turned too, the place is in the lower floor's frame", () => {
    const s = st(); s.layout.floors.ground.rotation = -2.5; s.layout.floors.ground.offset = [-57, 112]; s.layout.floors.first.rotation = 1.5; // first minus ground: turn 4
    expect(s.alignToBelow("first")).toBe(true);
    const pl = floorPlace(s.layout, "first", "ground");
    expect(pl.turn).toBeCloseTo(4, 9);
    expect(Math.abs(pl.shift[0] - 83)).toBeLessThan(2); expect(Math.abs(pl.shift[1] + 41)).toBeLessThan(2);
    ok(s);
  });
  it("a floor with no turn now gets the turn the search finds (S30.7: ground over basement, -2.5)", () => {
    const s = st();
    s.alignToBelow("ground");
    expect(Math.abs(floorPose(s.layout, "ground").rot + 2.5)).toBeLessThan(0.2);
  });
});

describe("alignToBelow applies the turn (S30.7)", () => {
  /** The largest distance, in the house (the basement's frame, which has no pose), between where the pose puts each outline corner of `key` and where `truth` puts it. */
  const cornerErr = (s: EditorState, key: string, truth: { turn: number; shift: Pt }) => {
    const place = floorPlace(s.layout, key, LOWEST);
    return Math.max(...mk().floors[key].outline.map((p) => {
      const a = placePoint(place, p), b = placePoint(truth, p);
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }));
  };
  const gap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

  it("from no pose: the ground then the first floor land on the truth, one undo step each", () => {
    const s = st();
    expect(s.alignToBelow("ground")).toBe(true);
    expect(s.alignToBelow("first")).toBe(true);
    ok(s);
    expect(cornerErr(s, "ground", GROUND_TO_BASEMENT)).toBeLessThanOrEqual(2);
    expect(cornerErr(s, "first", composePlace(FIRST_TO_GROUND, GROUND_TO_BASEMENT))).toBeLessThanOrEqual(2);
    expect(gap(floorPose(s.layout, "ground").rot, -2.5)).toBeLessThan(0.2);
    expect(gap(floorPlace(s.layout, "first", "ground").turn, 4)).toBeLessThan(0.2);
    s.undo(); expect("rotation" in s.layout.floors.first).toBe(false); expect("offset" in s.layout.floors.first).toBe(false);
    s.undo(); expect("rotation" in s.layout.floors.ground).toBe(false); expect(s.canUndo).toBe(false);
  });

  it("the stored place is the prior: a first floor stored a half turn off (184 from the ground) answers -176, one stored near 0 answers 4", () => {
    const set = (rot?: number) => { const s = st(); s.layout.floors.ground.rotation = -2.5; s.layout.floors.ground.offset = [-57, 112]; if (rot !== undefined) s.layout.floors.first.rotation = rot; return s; };
    const half = set(-178.5); // place turn 181.5 - 360... = -178.5 + 2.5 = -176 from the ground
    expect(half.alignToBelow("first")).toBe(true);
    expect(gap(floorPlace(half.layout, "first", "ground").turn, -176)).toBeLessThan(0.2);
    const near = set();
    expect(near.alignToBelow("first")).toBe(true);
    expect(gap(floorPlace(near.layout, "first", "ground").turn, 4)).toBeLessThan(0.2);
  });

  it("a turn press after Apply moves by one step, from the stored pose", () => {
    const s = st(); s.alignToBelow("ground");
    const before = floorPose(s.layout, "ground").rot;
    expect(s.turnFloor("ground", 1, floorPivot(s.layout.floors.ground))).toBe(true);
    expect(floorPose(s.layout, "ground").rot).toBeCloseTo(before + 1, 2);
    s.undo(); expect(floorPose(s.layout, "ground").rot).toBe(before);
  });

  const upperRot: [string, number | undefined][] = [["absent", undefined], ["4", 4], ["-176", -176]];
  const lowerRot: [string, number | undefined][] = [["absent", undefined], ["-2.5", -2.5]];
  const lowerOff: [string, Pt | undefined][] = [["absent", undefined], ["set", [-57, 112]]];
  for (const [un, ur] of upperRot) for (const [ln, lr] of lowerRot) for (const [on, lo] of lowerOff) for (const locked of [false, true])
    for (const key of [LOWEST, MIDDLE, "first", "nope", "__proto__"]) {
      it(`upper rotation ${un}, lower rotation ${ln}, lower offset ${on}, lock ${locked}, floor ${key}`, () => {
        const s = st(locked);
        const below = KEYS[KEYS.indexOf(key) - 1];
        if (below !== undefined) { if (lr !== undefined) s.layout.floors[below].rotation = lr; if (lo) s.layout.floors[below].offset = [...lo]; }
        if (KEYS.includes(key) && ur !== undefined) s.layout.floors[key].rotation = ur;
        const before = JSON.stringify(s.layout);
        const r = s.alignToBelow(key);
        ok(s);
        if (!r) { expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false); return; }
        expect(locked).toBe(false); expect(s.canUndo).toBe(true);
        s.undo(); expect(JSON.stringify(s.layout)).toBe(before); expect(s.canUndo).toBe(false);
        s.redo(); ok(s);
        // applying again changes nothing and records nothing
        expect(s.alignToBelow(key)).toBe(false);
        s.undo(); expect(s.canUndo).toBe(false);
      });
    }
});
