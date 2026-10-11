import { describe, it, expect } from "vitest";
import hand from "../fixtures/hand-align-house.json";
import type { Layout } from "../../src/core/schema";
import { floorPivot, floorPose } from "../../src/core";
import { EditorState } from "../../src/editor/state";
import { parseAlignNumber } from "../../src/editor/inspector";

// Opus review of Sprint 29, findings 2, 3 and 7 at the state level.

const house = () => structuredClone(hand) as unknown as Layout;
const at = (p: { rot: number; off: [number, number] }, q: [number, number]): [number, number] => {
  const a = (p.rot * Math.PI) / 180;
  return [q[0] * Math.cos(a) - q[1] * Math.sin(a) + p.off[0], q[0] * Math.sin(a) + q[1] * Math.cos(a) + p.off[1]];
};

describe("parseAlignNumber (finding 7)", () => {
  it("takes plain decimals, a comma for the point, a sign and surrounding space", () => {
    expect(parseAlignNumber("3,5")).toBe(3.5);
    expect(parseAlignNumber("-2.25")).toBe(-2.25);
    expect(parseAlignNumber(" +4 ")).toBe(4);
    expect(parseAlignNumber("0")).toBe(0);
    expect(parseAlignNumber(".5")).toBe(0.5);
    expect(parseAlignNumber("5.")).toBe(5);
    expect(parseAlignNumber("007")).toBe(7);
  });
  it("rejects hex, binary, exponent, Infinity, separators, doubles and empty", () => {
    for (const bad of ["0x10", "0X1f", "0b11", "0o7", "1e3", "1E-1", "Infinity", "-Infinity", "NaN", "1_000", "1 000", "12abc", "--3", "+-3", "1.2.3", "1,2,3", "1,2.3", "+", "-", ".", ",", "", "   ", "١٢"])
      expect(parseAlignNumber(bad), JSON.stringify(bad)).toBeNaN();
  });
});

describe("EditorState.setRotation (finding 2)", () => {
  it("keeps the pivot's house point, in one undo step, like turnFloor to the same angle", () => {
    const a = new EditorState(house()), b = new EditorState(house());
    const pivot = floorPivot(a.layout.floors.first);
    expect(Math.hypot(pivot[0], pivot[1])).toBeGreaterThan(150);
    expect(a.setRotation("first", 6, pivot)).toBe(true);
    expect((a as any).hist.length).toBe(1);
    expect(b.turnFloor("first", 3, pivot)).toBe(true);
    expect(b.turnFloor("first", 3, pivot)).toBe(true);
    const pa = floorPose(a.layout, "first"), pb = floorPose(b.layout, "first");
    expect(pa.rot).toBe(6);
    expect(pa).toEqual(pb);
    const h = at(pa, pivot);
    expect(Math.hypot(h[0] - pivot[0], h[1] - pivot[1])).toBeLessThan(0.1);
  });
  it("turns from the exact session pose after a button press, not from the rounded one", () => {
    const a = new EditorState(house()), p = floorPivot(a.layout.floors.first);
    a.turnFloor("first", 0.5, p); a.setRotation("first", 1.5, p);
    const b = new EditorState(house());
    b.turnFloor("first", 1.5, p);
    expect(floorPose(a.layout, "first")).toEqual(floorPose(b.layout, "first"));
  });
  it("the same visible angle writes nothing; a stored -180 stays -180 whichever way it is typed", () => {
    const s = new EditorState(house());
    s.layout.floors.first.rotation = -180;
    const p = floorPivot(s.layout.floors.first), before = JSON.stringify(s.layout);
    expect(s.setRotation("first", -180, p)).toBe(false);
    expect(s.setRotation("first", 180, p)).toBe(false);
    expect(s.setRotation("first", 180.001, p)).toBe(false); // rounds to the same 0.01
    expect(JSON.stringify(s.layout)).toBe(before);
    expect(s.canUndo).toBe(false);
  });
  it("junk, an unknown floor and Lock plan write nothing", () => {
    const s = new EditorState(house()), p = floorPivot(s.layout.floors.first), before = JSON.stringify(s.layout);
    for (const bad of [NaN, Infinity, "3" as any, null as any]) expect(s.setRotation("first", bad, p)).toBe(false);
    expect(s.setRotation("nope", 3, p)).toBe(false);
    expect(s.setRotation("first", 3, [NaN, 0])).toBe(false);
    s.planLocked = true;
    expect(s.setRotation("first", 3, p)).toBe(false);
    expect(JSON.stringify(s.layout)).toBe(before);
  });
});

describe("EditorState.lastPose (finding 3)", () => {
  it("tells a pose that did not change ('same') from one that was refused", () => {
    const s = new EditorState(house());
    expect(s.setPose("first", { rot: 0, off: [0, 0] })).toBe(false);
    expect(s.lastPose).toBe("same");
    expect(s.setPose("first", { rot: 0, off: [1e9, 0] })).toBe(false);
    expect(s.lastPose).toBe("refused");
    expect(s.setPose("first", { rot: 0, off: [5, 0] })).toBe(true);
    expect(s.lastPose).toBe("wrote");
    expect(s.setPose("first", { rot: 0, off: [5.02, 0] })).toBe(false);
    expect(s.lastPose).toBe("same");
    s.planLocked = true;
    expect(s.setPose("first", { rot: 0, off: [9, 0] })).toBe(false);
    expect(s.lastPose).toBe("refused");
  });
  it("a stored -180 compared with 180 is the same pose", () => {
    const s = new EditorState(house());
    s.layout.floors.first.rotation = -180;
    expect(s.setPose("first", { rot: 180, off: [0, 0] })).toBe(false);
    expect(s.lastPose).toBe("same");
    expect(s.layout.floors.first.rotation).toBe(-180);
  });
});
