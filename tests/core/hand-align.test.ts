import { describe, it, expect } from "vitest";
import { stairAxis, stairReport, stairPlace, placePoint, migrate } from "../../src/core";
import type { Floor, Pt, Stairs } from "../../src/core";
import { stairBlocks } from "../../src/core/solids";
import houseJson from "../fixtures/hand-align-house.json";
import { FIRST_TO_GROUND, GROUND_TO_BASEMENT } from "../fixtures/hand-align-truth";

const house = migrate(JSON.parse(JSON.stringify(houseJson))) as any;
const floor = (k: string): Floor => house.floors[k];
const ID = { turn: 0, shift: [0, 0] as Pt };
const stair = (x0: number, y0: number, x1: number, y1: number, rot = 0, extra: Partial<Stairs> = {}): Stairs =>
  ({ id: "s", name: "S", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], shape: "straight", steps: 10, rot, direction: "up", ...extra } as Stairs);
const fl = (...stairs: Stairs[]): Floor => ({ title: "x", outline: [], rooms: [], walls: [], stairs, doors: [], openings: [], extras: [], devices: [], furniture: [], unlinked: [] }) as any;
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const angDiff = (a: number, b: number) => { const d = ((a - b) % 360 + 540) % 360 - 180; return Math.abs(d); };

describe("stairAxis (S29.8)", () => {
  it("a straight flight along x climbs from the left edge middle to the right edge middle", () => {
    const a = stairAxis(stair(10, 20, 210, 100))!;
    expect(a.low).toEqual([10, 60]);
    expect(a.top).toEqual([210, 60]);
    expect(a.centre).toEqual([110, 60]);
  });
  it("a flight along y climbs toward -y: low at the bottom edge middle", () => {
    const a = stairAxis(stair(0, 0, 80, 200))!;
    expect(a.low).toEqual([40, 200]);
    expect(a.top).toEqual([40, 0]);
  });
  it("rot turns both ends about the centre of the box", () => {
    const a = stairAxis(stair(0, 0, 200, 80, 90))!;
    near(a.low![0], 100, 1e-9); near(a.low![1], 40 - 100, 1e-9);
    near(a.top![0], 100, 1e-9); near(a.top![1], 40 + 100, 1e-9);
  });
  it("a round stair has a centre and no ends", () => {
    const a = stairAxis(stair(0, 0, 100, 100, 0, { shape: "round", dia: 100, inner: 0 }))!;
    expect(a.centre).toEqual([50, 50]);
    expect(a.low).toBeUndefined();
    expect(a.top).toBeUndefined();
  });
  it("junk gives null and never throws", () => {
    for (const bad of [null, undefined, 5, "x", {}, { pts: 5 }, { pts: [[0, 0]] }, { pts: [[0, 0], [NaN, 1], [2, 2]] }, stair(0, 0, 10, 10, 0, { shape: "round", dia: -3 })])
      expect(() => stairAxis(bad as any)).not.toThrow();
    expect(stairAxis({ pts: 5 } as any)).toBeNull();
    expect(stairAxis(null as any)).toBeNull();
  });
});

describe("stairReport (S29.8)", () => {
  it("a hand-computed case: distance and the axis angle between flights", () => {
    // upper centre (100, 40), placed 30 cm down: (100, 70). lower centre (150, 40). 50 across, 30 down: 58.31.
    const upper = fl(stair(0, 0, 200, 80, 0)), lower = fl(stair(50, 0, 250, 80, 3.5));
    const r = stairReport(upper, lower, { turn: 0, shift: [0, 30] });
    expect(r).toHaveLength(1);
    near(r[0].distance!, Math.hypot(50, 30), 1e-9);
    near(r[0].angle!, 3.5, 1e-9);
  });
  it("the angle is modulo 180 and the smaller way round", () => {
    const upper = fl(stair(0, 0, 200, 80, 0));
    for (const [rot, want] of [[183, 3], [177, 3], [90, 90], [-10, 10], [350, 10]] as const)
      near(stairReport(upper, fl(stair(0, 0, 200, 80, rot)), ID)[0].angle!, want, 1e-9);
  });
  it("the place turns the upper flight before it is compared", () => {
    const upper = fl(stair(0, 0, 200, 80, 0)), lower = fl(stair(0, 0, 200, 80, 7));
    near(stairReport(upper, lower, { turn: 4, shift: [0, 0] })[0].angle!, 3, 1e-9);
  });
  it("picks the nearest lower stair; names come with it", () => {
    const upper = fl({ ...stair(0, 0, 200, 80), name: "Up" });
    const lower = fl({ ...stair(500, 0, 700, 80), id: "far", name: "Far" }, { ...stair(20, 10, 220, 90), id: "near", name: "Near" });
    const r = stairReport(upper, lower, ID);
    expect(r[0].name).toBe("Up");
    expect(r[0].nearest).toEqual({ id: "near", name: "Near" });
    near(r[0].distance!, Math.hypot(20, 10), 1e-9);
  });
  it("a round stair has a distance and no angle", () => {
    const round = stair(0, 0, 100, 100, 0, { shape: "round", dia: 100, inner: 0 });
    const r = stairReport(fl(round), fl(stair(0, 0, 200, 80)), ID);
    expect(r[0].distance).not.toBeNull();
    expect(r[0].angle).toBeNull();
  });
  it("no lower stairs: the row is there, the nearest is null", () => {
    const r = stairReport(fl(stair(0, 0, 200, 80)), fl(), ID);
    expect(r).toHaveLength(1);
    expect(r[0].nearest).toBeNull();
    expect(r[0].distance).toBeNull();
    expect(stairReport(fl(), fl(stair(0, 0, 200, 80)), ID)).toEqual([]);
  });
  it("junk never throws", () => {
    for (const bad of [null, undefined, 5, {}, { stairs: 5 }, { stairs: [null, 3, { pts: 4 }] }]) {
      expect(() => stairReport(bad as any, fl(stair(0, 0, 10, 10)), ID)).not.toThrow();
      expect(() => stairReport(fl(stair(0, 0, 10, 10)), bad as any, ID)).not.toThrow();
      expect(stairReport(bad as any, bad as any, ID)).toEqual([]);
    }
    expect(() => stairReport(fl(stair(0, 0, 10, 10)), fl(stair(0, 0, 10, 10)), { turn: NaN, shift: [Infinity, 0] })).not.toThrow();
  });
});

describe("stairPlace (S29.8)", () => {
  it("ground over basement, from identity: the true place within 2 cm and 0.2 degrees", () => {
    const r = stairPlace(floor("ground"), floor("basement"), ID)!;
    expect(r).not.toBeNull();
    near(r.place.shift[0], GROUND_TO_BASEMENT.shift[0], 2); near(r.place.shift[1], GROUND_TO_BASEMENT.shift[1], 2);
    near(angDiff(r.place.turn, GROUND_TO_BASEMENT.turn), 0, 0.2);
  });
  it("first over ground: the true place", () => {
    const r = stairPlace(floor("first"), floor("ground"), ID)!;
    near(r.place.shift[0], FIRST_TO_GROUND.shift[0], 2); near(r.place.shift[1], FIRST_TO_GROUND.shift[1], 2);
    near(angDiff(r.place.turn, FIRST_TO_GROUND.turn), 0, 0.2);
  });
  it("from a wrong start the answer is the same: the place it returns is absolute", () => {
    const r = stairPlace(floor("ground"), floor("basement"), { turn: 20, shift: [300, -80] })!;
    near(r.place.shift[0], GROUND_TO_BASEMENT.shift[0], 2); near(r.place.shift[1], GROUND_TO_BASEMENT.shift[1], 2);
    near(angDiff(r.place.turn, GROUND_TO_BASEMENT.turn), 0, 0.2);
  });
  it("the corners of the stair land on the lower one's within 0.5 cm", () => {
    const r = stairPlace(floor("first"), floor("ground"), ID)!;
    const u = stairBlocks(floor("first").stairs[0])!.foot(0), l = stairBlocks(floor("ground").stairs[0])!.foot(0);
    const p = u.map((q) => placePoint(r.place, q));
    // the order of the footprint corners is the same turned box, whichever way the flight is drawn: match each to its nearest
    for (const c of p) expect(Math.min(...l.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])))).toBeLessThan(0.5);
  });
  it("a flight drawn reversed on the floor below gives the same place", () => {
    const lower = JSON.parse(JSON.stringify(floor("basement"))) as Floor;
    lower.stairs[0].rot += 180;
    const a = stairPlace(floor("ground"), floor("basement"), ID)!, b = stairPlace(floor("ground"), lower, ID)!;
    near(b.place.shift[0], a.place.shift[0], 1e-6); near(b.place.shift[1], a.place.shift[1], 1e-6);
    near(angDiff(b.place.turn, a.place.turn), 0, 1e-6);
  });
  it("a flight drawn reversed on the upper floor gives the same place", () => {
    const upper = JSON.parse(JSON.stringify(floor("ground"))) as Floor;
    upper.stairs[0].rot += 180;
    const a = stairPlace(floor("ground"), floor("basement"), ID)!, b = stairPlace(upper, floor("basement"), ID)!;
    near(b.place.shift[0], a.place.shift[0], 1e-6); near(b.place.shift[1], a.place.shift[1], 1e-6);
    near(angDiff(b.place.turn, a.place.turn), 0, 1e-6);
  });
  it("the smaller turn wins: never a half turn when the other way is a few degrees", () => {
    const r = stairPlace(fl(stair(0, 0, 200, 80, 0)), fl(stair(0, 0, 200, 80, 175)), ID)!;
    expect(Math.abs(r.place.turn)).toBeLessThan(10);
    near(r.turned, 5, 1e-9);
  });
  it("round stairs move and do not turn", () => {
    const round = (x: number, y: number) => stair(x, y, x + 100, y + 100, 0, { shape: "round", dia: 100, inner: 0 });
    const r = stairPlace(fl(round(0, 0)), fl(round(300, 200)), { turn: 4, shift: [0, 0] })!;
    expect(r.place.turn).toBe(4);
    expect(r.turned).toBe(0);
    const c = placePoint(r.place, [50, 50]); // the upper centre, turned by the kept 4 degrees, lands on the lower centre
    near(c[0], 350, 1e-9); near(c[1], 250, 1e-9);
    expect(r.text).toContain("round stairs: moved, not turned");
  });
  it("a round stair on one floor and a flight on the other: centres meet, no turn", () => {
    const r = stairPlace(fl(stair(0, 0, 200, 80, 30)), fl(stair(500, 500, 600, 600, 0, { shape: "round", dia: 100, inner: 0 })), ID)!;
    expect(r.turned).toBe(0);
    near(r.place.shift[0], 550 - 100, 1e-9); near(r.place.shift[1], 550 - 40, 1e-9);
  });
  it("the words say what it did, with names", () => {
    const r = stairPlace(floor("ground"), floor("basement"), ID)!;
    expect(r.text).toMatch(/^Aligned Ground stairs to Basement stairs: moved \d+ cm, turned \d+(\.\d)?°$/);
    expect(r.moved).toBeGreaterThan(0);
    near(r.turned, 2.5, 0.2);
  });
  it("a name is text, not markup: it comes back as written", () => {
    const r = stairPlace(fl({ ...stair(0, 0, 200, 80), name: '"><script>' }), fl({ ...stair(10, 0, 210, 80), name: "<b>" }), ID)!;
    expect(r.text).toContain('"><script>');
    expect(r.text).toContain("<b>");
  });
  it("no stairs, one floor without, junk: null, never a throw", () => {
    const s = fl(stair(0, 0, 200, 80));
    expect(stairPlace(fl(), fl(), ID)).toBeNull();
    expect(stairPlace(s, fl(), ID)).toBeNull();
    expect(stairPlace(fl(), s, ID)).toBeNull();
    for (const bad of [null, undefined, 5, {}, { stairs: 5 }, { stairs: [null, 3, { pts: 4 }, { pts: [[0, 0], [NaN, 1], [2, 2]] }] }]) {
      expect(() => stairPlace(bad as any, s, ID)).not.toThrow();
      expect(stairPlace(bad as any, s, ID)).toBeNull();
      expect(stairPlace(s, bad as any, ID)).toBeNull();
    }
    expect(() => stairPlace(s, s, { turn: NaN, shift: [Infinity, 1] } as any)).not.toThrow();
  });
  it("uses the first stair that has a footprint", () => {
    const bad = { ...stair(0, 0, 200, 80), pts: 5 } as any;
    const r = stairPlace(fl(bad, stair(0, 0, 200, 80)), fl(stair(40, 30, 240, 110)), ID)!;
    near(r.place.shift[0], 40, 1e-9); near(r.place.shift[1], 30, 1e-9);
  });
});

describe("one rule for the report and Align stairs (review 29, finding 4)", () => {
  // Two stairs on the floor below: the first in the list is far from the upper stair, the second is near.
  const upper = fl(stair(1000, 1000, 1200, 1080, 0, { id: "u", name: "Up" }));
  const lower = fl(stair(0, 0, 200, 80, 0, { id: "far", name: "Far" }), stair(1010, 1005, 1210, 1085, 0, { id: "near", name: "Near" }));
  it("Align stairs lays the upper floor's first stair on the nearest stair below, not the first in the list", () => {
    const r = stairPlace(upper, lower, ID)!;
    expect(r.text).toContain("to Near");
    near(r.place.shift[0], 10, 1e-9); near(r.place.shift[1], 5, 1e-9);
  });
  it("the report's nearest stair for that row is the one the button uses", () => {
    const row = stairReport(upper, lower, ID)[0], r = stairPlace(upper, lower, ID)!;
    expect(row.nearest!.name).toBe("Near");
    expect(r.text).toContain(`to ${row.nearest!.name}`);
  });
  it("the distance is measured with the upper stair drawn by the place", () => {
    const moved = { turn: 0, shift: [-1000, -1000] as Pt };
    expect(stairPlace(upper, lower, moved)!.text).toContain("to Far");
    expect(stairReport(upper, lower, moved)[0].nearest!.name).toBe("Far");
  });
});
