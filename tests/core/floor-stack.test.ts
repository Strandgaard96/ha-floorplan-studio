import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { floorBelow, floorsBelow, floorPose, floorPlace, floorPivot, placePoint, invertPlace, composePlace, poseFromPlace, normaliseTurn, migrate, validate } from "../../src/core";
import type { Layout, Pt } from "../../src/core";
import { stairBlocks } from "../../src/core/solids";
import houseJson from "../fixtures/hand-align-house.json";
import { FIRST_TO_GROUND, GROUND_TO_BASEMENT } from "../fixtures/hand-align-truth";

const fl = (offset?: unknown) => ({ title: "x", outline: [], rooms: [], walls: [], stairs: [], doors: [], openings: [], extras: [], devices: [], furniture: [], unlinked: [], ...(offset === undefined ? {} : { offset }) });
const house = (): any => ({ version: 2, unit: "cm", north: 0, floors: { ground: fl([100, 40]), first: fl([-30, 7]), attic: fl() }, catalog: [] });

describe("floor stack helpers (S27.3)", () => {
  it("floorBelow is the key before, or null", () => {
    const l = house();
    expect(floorBelow(l, "first")).toBe("ground");
    expect(floorBelow(l, "attic")).toBe("first");
    expect(floorBelow(l, "ground")).toBeNull();
    expect(floorBelow(l, "nope")).toBeNull();
  });
  it("floorsBelow lists every lower key, nearest first", () => {
    const l = house();
    expect(floorsBelow(l, "attic")).toEqual(["first", "ground"]);
    expect(floorsBelow(l, "first")).toEqual(["ground"]);
    expect(floorsBelow(l, "ground")).toEqual([]);
    expect(floorsBelow(l, "nope")).toEqual([]);
  });
  it("the shift is from.offset - to.offset, asymmetric", () => {
    const l = house();
    expect(floorPlace(l, "ground", "first").shift).toEqual([130, 33]);
    expect(floorPlace(l, "first", "ground").shift).toEqual([-130, -33]);
    expect(floorPlace(l, "attic", "first").shift).toEqual([30, -7]);
    expect(floorPlace(l, "first", "first").shift).toEqual([0, 0]);
  });
  it("an unknown key reads as offset [0, 0]", () => {
    const l = house();
    expect(floorPlace(l, "nope", "first").shift).toEqual([30, -7]);
    expect(floorPlace(l, "ground", "nope").shift).toEqual([100, 40]);
  });
  it("junk offsets read as [0, 0] and never throw", () => {
    const l = house();
    for (const bad of ["1,2", [1], [1, 2, 3], [NaN, 0], [0, Infinity], [2e7, 0], null, {}, 5, ["1", "2"]]) {
      l.floors.first.offset = bad;
      expect(floorPlace(l, "ground", "first").shift).toEqual([100, 40]);
      expect(floorPlace(l, "first", "attic").shift).toEqual([0, 0]);
    }
  });
  it("never throws on a broken layout", () => {
    for (const l of [null, undefined, 5, {}, { floors: null }, { floors: [] }, { floors: { a: null, b: 5 } }] as any[]) {
      expect(floorBelow(l, "a")).toBeNull();
      expect(floorsBelow(l, "b")).toEqual(l?.floors && typeof l.floors === "object" && !Array.isArray(l.floors) ? ["a"] : []);
      expect(floorPlace(l, "a", "b").shift).toEqual([0, 0]);
    }
  });
  it("a floor whose key is __proto__ is an ordinary floor", () => {
    const floors: any = Object.create(null);
    Object.defineProperty(floors, "__proto__", { value: fl([5, 6]), enumerable: true, writable: true, configurable: true });
    Object.defineProperty(floors, "up", { value: fl([1, 1]), enumerable: true, writable: true, configurable: true });
    const l: any = { floors };
    expect(floorBelow(l, "up")).toBe("__proto__");
    expect(floorsBelow(l, "up")).toEqual(["__proto__"]);
    expect(floorBelow(l, "__proto__")).toBeNull();
    expect(floorPlace(l, "__proto__", "up").shift).toEqual([4, 5]);
    expect(floorPlace(l, "up", "__proto__").shift).toEqual([-4, -5]);
  });
  it("a plain object with an inherited toString key is not a floor", () => {
    const l = house();
    expect(floorPlace(l, "toString", "first").shift).toEqual([30, -7]);
    expect(floorBelow(l, "constructor")).toBeNull();
  });
});

// ---- S29.2: pose helpers. Sign convention, pinned here: rotation is degrees, CLOCKWISE on screen (y points down), so
// R(90) sends (1, 0), a point to the right, to (0, 1), a point below. R(4) sends (100, 0) to (99.756.., 6.976..).
const close = (a: Pt, b: Pt, tol = 1e-9) => { expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(tol); expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(tol); };
const pose = (rotation?: unknown, offset?: unknown) => ({ ...fl(offset), ...(rotation === undefined ? {} : { rotation }) });
/** Three floors with asymmetric poses: a (4, [83, -41]), b (-2.5, [-57, 112]), c (31.25, [-210.5, 9.75]). */
const three = (): any => ({ version: 2, unit: "cm", north: 0, floors: { a: pose(4, [83, -41]), b: pose(-2.5, [-57, 112]), c: pose(31.25, [-210.5, 9.75]) }, catalog: [] });

describe("rotation sign (S29.2)", () => {
  it("a turn of +90 sends the point to the right (1, 0) to the point below it (0, 1): clockwise on screen", () => {
    close(placePoint({ turn: 90, shift: [0, 0] }, [1, 0]), [0, 1]);
    close(placePoint({ turn: 90, shift: [0, 0] }, [0, 1]), [-1, 0]);
  });
  it("a turn of 4 sends (100, 0) to (cos 4, sin 4) * 100, below the x axis", () => {
    close(placePoint({ turn: 4, shift: [0, 0] }, [100, 0]), [99.75635, 6.97565], 1e-4);
    expect(placePoint({ turn: 4, shift: [0, 0] }, [100, 0])[1]).toBeGreaterThan(0);
  });
  it("the shift is added after the turn", () => {
    close(placePoint({ turn: 90, shift: [10, 20] }, [1, 0]), [10, 21]);
  });
  it("a floor with rotation 90 and offset [0, 0] puts its stored (1, 0) at (0, 1) in the house, so the floor above it sees it at (0, 1)", () => {
    const l: any = { floors: { low: pose(), up: pose(90, [0, 0]) } };
    close(placePoint(floorPlace(l, "up", "low"), [1, 0]), [0, 1]);
  });
  it("worked example: ground -2.5 at [-57, 112] over a basement at the origin", () => {
    const l: any = { floors: { basement: pose(), ground: pose(-2.5, [-57, 112]) } };
    // The ground's (400, 240) sits at R(-2.5)(400, 240) + (-57, 112) = (353.0879.., 334.3238..) in the basement.
    close(placePoint(floorPlace(l, "ground", "basement"), [400, 240]), [353.0879, 334.3238], 1e-3);
    expect(floorPlace(l, "ground", "basement")).toEqual({ turn: -2.5, shift: [-57, 112] });
    // And the other way: turn +2.5, shift R(2.5)(57, -112).
    const back = floorPlace(l, "basement", "ground");
    expect(back.turn).toBe(2.5);
    close(placePoint(back, [353.0879, 334.3238]), [400, 240], 1e-3);
  });
});

describe("floorPose (S29.2)", () => {
  it("reads rotation and offset; absent is identity", () => {
    const l = three();
    expect(floorPose(l, "a")).toEqual({ rot: 4, off: [83, -41] });
    expect(floorPose({ floors: { x: fl() } } as any, "x")).toEqual({ rot: 0, off: [0, 0] });
    expect(floorPose(l, "nope")).toEqual({ rot: 0, off: [0, 0] });
  });
  it("junk reads as identity, one field at a time", () => {
    for (const bad of [NaN, Infinity, "3", null, 181, -180.5, [4], {}]) {
      const l: any = { floors: { x: pose(bad, [5, 6]) } };
      expect(floorPose(l, "x")).toEqual({ rot: 0, off: [5, 6] });
    }
    for (const bad of ["1,2", [1], [NaN, 0], [2e7, 0], null]) {
      const l: any = { floors: { x: pose(7, bad) } };
      expect(floorPose(l, "x")).toEqual({ rot: 7, off: [0, 0] });
    }
  });
});

describe("floorPlace (S29.2)", () => {
  it("turn is rot_from - rot_to and shift is R(-rot_to) * (off_from - off_to)", () => {
    const p = floorPlace(three(), "a", "b");
    expect(p.turn).toBeCloseTo(6.5, 12);
    // R(+2.5) (140, -153) = (140 cos 2.5 + 153 sin 2.5, 140 sin 2.5 - 153 cos 2.5)
    close(p.shift, [140 * Math.cos(Math.PI / 72) + 153 * Math.sin(Math.PI / 72), 140 * Math.sin(Math.PI / 72) - 153 * Math.cos(Math.PI / 72)]);
  });
  it("a point goes from A to B and back within 1e-9, for all six ordered pairs", () => {
    const l = three(), pts: Pt[] = [[0, 0], [123.4, -56.7], [-900.25, 411.5]];
    for (const x of ["a", "b", "c"]) for (const y of ["a", "b", "c"]) for (const q of pts) {
      const there = placePoint(floorPlace(l, x, y), q);
      close(placePoint(floorPlace(l, y, x), there), q);
    }
  });
  it("A to C equals A to B then B to C", () => {
    const l = three(), q: Pt = [321.5, -77.25];
    const direct = floorPlace(l, "a", "c"), viaB = composePlace(floorPlace(l, "a", "b"), floorPlace(l, "b", "c"));
    expect(direct.turn).toBeCloseTo(viaB.turn, 12);
    close(direct.shift, viaB.shift);
    close(placePoint(direct, q), placePoint(floorPlace(l, "b", "c"), placePoint(floorPlace(l, "a", "b"), q)));
  });
  it("a floor onto itself is the identity", () => {
    const p = floorPlace(three(), "b", "b");
    expect(p.turn).toBe(0);
    close(p.shift, [0, 0]);
  });
  it("both rotations 0 gives turn 0 and the offset difference exactly (the S27.3 cases)", () => {
    const l = house();
    const want: [string, string, Pt][] = [["ground", "first", [130, 33]], ["first", "ground", [-130, -33]], ["attic", "first", [30, -7]], ["first", "first", [0, 0]], ["nope", "first", [30, -7]], ["ground", "nope", [100, 40]]];
    for (const [a, b, shift] of want) expect(floorPlace(l, a, b), `${a} to ${b}`).toEqual({ turn: 0, shift });
  });
  it("floorShift is gone: nothing in src/ names it", () => {
    const hits: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|js|mjs)$/.test(n) && readFileSync(p, "utf8").includes("floorShift")) hits.push(p); } };
    walk("src");
    expect(hits).toEqual([]);
  });
  it("junk on either floor reads as identity and never throws", () => {
    const l: any = { floors: { a: pose("3", [10, 0]), b: pose(NaN, [0, 4]), c: pose(5, [1, 1]) } };
    expect(floorPlace(l, "a", "b")).toEqual({ turn: 0, shift: [10, -4] });
    expect(floorPlace(l, "c", "a")).toEqual({ turn: 5, shift: [-9, 1] });
    for (const bad of [null, undefined, 5, {}, { floors: null }, { floors: [] }, { floors: { a: null } }] as any[]) {
      expect(floorPlace(bad, "a", "b")).toEqual({ turn: 0, shift: [0, 0] });
    }
  });
  it("a floor whose key is __proto__ is an ordinary floor", () => {
    const floors: any = Object.create(null);
    Object.defineProperty(floors, "__proto__", { value: pose(4, [83, -41]), enumerable: true, writable: true, configurable: true });
    Object.defineProperty(floors, "up", { value: pose(-2.5, [-57, 112]), enumerable: true, writable: true, configurable: true });
    const l: any = { floors };
    expect(floorPose(l, "__proto__")).toEqual({ rot: 4, off: [83, -41] });
    expect(floorPlace(l, "__proto__", "up").turn).toBeCloseTo(6.5, 12);
    expect(floorPlace(l, "up", "__proto__").turn).toBeCloseTo(-6.5, 12);
  });
});

describe("place algebra (S29.2)", () => {
  const p1 = { turn: 4, shift: [83, -41] as Pt }, p2 = { turn: -2.5, shift: [-57, 112] as Pt }, q: Pt = [210.5, -33.25];
  it("invertPlace undoes placePoint", () => {
    close(placePoint(invertPlace(p1), placePoint(p1, q)), q);
    close(placePoint(p1, placePoint(invertPlace(p1), q)), q);
    expect(invertPlace(p1).turn).toBe(-4);
  });
  it("composePlace(a, b) applies a first, then b", () => {
    const c = composePlace(p1, p2);
    expect(c.turn).toBeCloseTo(1.5, 12);
    close(placePoint(c, q), placePoint(p2, placePoint(p1, q)));
    // Not commutative: a swap is caught.
    expect(Math.hypot(...(placePoint(composePlace(p2, p1), q).map((v, i) => v - placePoint(c, q)[i]) as Pt))).toBeGreaterThan(1);
  });
  it("poseFromPlace then floorPlace gives the place back, below turned and shifted too", () => {
    const l = three();
    for (const place of [{ turn: 4, shift: [83, -41] as Pt }, { turn: -179.5, shift: [-1234.5, 8.25] as Pt }, { turn: 0, shift: [0, 0] as Pt }]) {
      const set = poseFromPlace(l, "a", "b", place);
      const l2 = structuredClone(l); l2.floors.a.rotation = set.rot; l2.floors.a.offset = set.off;
      const back = floorPlace(l2, "a", "b");
      // A turn is only known modulo 360: -179.5 and 180.5 are the same turn.
      expect(Math.abs(normaliseTurn(back.turn - place.turn))).toBeLessThan(1e-9);
      close(back.shift, place.shift);
    }
  });
  it("poseFromPlace returns a rotation in (-180, 180]", () => {
    const l = three();
    for (const turn of [170, -170, 179.99, 540, -540, 360]) {
      const r = poseFromPlace(l, "a", "b", { turn, shift: [0, 0] }).rot;
      expect(r).toBeGreaterThan(-180);
      expect(r).toBeLessThanOrEqual(180);
    }
  });
  it("poseFromPlace puts a point where the place says, in the house frame", () => {
    const l = three(), place = { turn: 4, shift: [83, -41] as Pt }, set = poseFromPlace(l, "a", "b", place);
    // Pose of a is (set.rot, set.off): its stored q sits at R(rot) q + off in the house; b's frame is the house turned by b's pose.
    const house = (rot: number, off: Pt, p: Pt) => placePoint({ turn: rot, shift: off }, p);
    const inB = placePoint(place, q);
    const bp = floorPose(l, "b");
    close(house(set.rot, set.off, q), house(bp.rot, bp.off, inB), 1e-9);
  });
});

describe("floorPivot (S29.2)", () => {
  const quad = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const f = (o: any = {}): any => ({ ...fl(), ...o });
  it("is the centre of the bounds of the outline and external walls", () => {
    expect(floorPivot(f({ outline: quad(100, 40, 700, 340) }))).toEqual([400, 190]);
    expect(floorPivot(f({ outline: quad(0, 0, 10, 10), walls: [{ id: "w", a: [-90, 0], b: [10, 60], kind: "external" }] }))).toEqual([-40, 30]);
  });
  it("ignores internal walls and stairs when the structure has lines", () => {
    const g = f({ outline: quad(0, 0, 300, 100), walls: [{ id: "w", a: [0, 0], b: [5000, 5000], kind: "wall" }], stairs: [{ id: "s", pts: quad(900, 900, 1000, 1000) }] });
    expect(floorPivot(g)).toEqual([150, 50]);
  });
  it("falls back to room edges, then stairs, then [0, 0]", () => {
    expect(floorPivot(f({ rooms: [{ id: "r", kind: "room", pts: quad(10, 20, 110, 220) }] }))).toEqual([60, 120]);
    expect(floorPivot(f({ stairs: [{ id: "s", pts: quad(300, 200, 500, 280) }] }))).toEqual([400, 240]);
    expect(floorPivot(f())).toEqual([0, 0]);
  });
  it("does not change with the pose", () => {
    const g = f({ outline: quad(100, 40, 700, 340) }), at = floorPivot(g);
    expect(floorPivot({ ...g, rotation: 37.5, offset: [900, -400] })).toEqual(at);
  });
  it("never throws on junk", () => {
    for (const bad of [null, undefined, 5, "x", [], { outline: 5, walls: "x", rooms: [null], stairs: [{ pts: "x" }, null] }, { outline: [[NaN, 1], [2, 3], [4, 5]], stairs: 7 }] as any[]) {
      const p = floorPivot(bad);
      expect(p.length).toBe(2);
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    }
  });
});

describe("hand-align-house fixture (S29.2)", () => {
  const raw = houseJson as any;
  const foot = (l: Layout, k: string): Pt[] => stairBlocks(l.floors[k].stairs[0])!.foot(0);
  it("validates, as written and through migrate, and carries no offset or rotation", () => {
    expect(validate(raw).ok).toBe(true);
    expect(validate(migrate(raw)).ok).toBe(true);
    expect(Object.keys(raw.floors)).toEqual(["basement", "ground", "first"]);
    for (const f of Object.values<any>(raw.floors)) { expect("offset" in f).toBe(false); expect("rotation" in f).toBe(false); }
  });
  it("has a straight stair on each floor, going up, both ways and down", () => {
    expect(Object.values<any>(raw.floors).map((f) => [f.stairs.length, f.stairs[0].shape, f.stairs[0].direction])).toEqual([[1, "straight", "up"], [1, "straight", "both"], [1, "straight", "down"]]);
  });
  it("the ground has a wing the basement lacks", () => {
    const area = (pts: Pt[]) => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
    expect(area(raw.floors.ground.outline)).toBeGreaterThan(area(raw.floors.basement.outline) * 1.3);
  });
  it("the truth puts each stair's corners on the floor below's within 0.5 cm", () => {
    const l = migrate(raw);
    for (const [up, lo, place] of [["ground", "basement", GROUND_TO_BASEMENT], ["first", "ground", FIRST_TO_GROUND]] as const) {
      const a = foot(l, up).map((p) => placePoint(place, p)), b = foot(l, lo);
      a.forEach((p, i) => close(p, b[i], 0.5));
    }
  });
  it("without the truth the stairs are far apart, so the test above is not vacuous", () => {
    const l = migrate(raw);
    for (const [up, lo] of [["ground", "basement"], ["first", "ground"]]) {
      const a = foot(l, up), b = foot(l, lo);
      expect(Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1])).toBeGreaterThan(20);
    }
  });
  it("storing the true pose makes floorPlace give the true place, within 1e-9", () => {
    const l: any = migrate(raw);
    const g = poseFromPlace(l, "ground", "basement", GROUND_TO_BASEMENT);
    l.floors.ground.rotation = g.rot; l.floors.ground.offset = g.off;
    const f = poseFromPlace(l, "first", "ground", FIRST_TO_GROUND);
    l.floors.first.rotation = f.rot; l.floors.first.offset = f.off;
    for (const [up, lo, place] of [["ground", "basement", GROUND_TO_BASEMENT], ["first", "ground", FIRST_TO_GROUND]] as const) {
      const p = floorPlace(l, up, lo);
      expect(Math.abs(p.turn - place.turn)).toBeLessThan(1e-9);
      close(p.shift, place.shift);
    }
    expect(g.rot).toBeCloseTo(-2.5, 12);
    expect(f.rot).toBeCloseTo(1.5, 12);
  });
});

describe("normaliseTurn keeps an angle that is already in range exactly (S29.9)", () => {
  it("returns 0.1, 0.01, -0.3 and 179.99 unchanged, and wraps 180 and -180 to 180", () => {
    for (const a of [0.1, 0.01, -0.3, 3.25, -179.99, 179.99, 0.5]) expect(normaliseTurn(a)).toBe(a);
    expect(normaliseTurn(180)).toBe(180);
    expect(normaliseTurn(-180)).toBe(180);
    expect(normaliseTurn(540.1)).toBeCloseTo(-179.9, 9);
    expect(normaliseTurn(-190)).toBeCloseTo(170, 9);
  });
});
