import { describe, expect, it } from "vitest";
import { FURNITURE_PARTS, partsOverlap, type Part } from "../../src/core/furniture-parts";
import { FURNITURE_SOLID } from "../../src/core/solids";
import { FURNITURE_SYMBOLS, type Floor, type FurnitureSymbol } from "../../src/core/schema";
import { buildScene, type Solid } from "../../src/core/scene";
import { furnitureBottom, furnitureHeight } from "../../src/core/heights";

// Written out on purpose (finding 17): how many boxes each symbol is drawn with in 3D; 0 = one box, as before.
const PART_COUNT: Record<FurnitureSymbol, number> = {
  table: 5,
  sofa: 4,
  bed: 4,
  chair: 6,
  sink: 5,
  toilet: 2,
  bathtub: 5,
  car: 2,
  cabinet: 0,
  shower: 0,
  tv: 0,
  speaker: 0,
  computer: 0,
  tree: 0,
  "patio-wood": 0,
  "patio-concrete": 0,
};

describe("FURNITURE_PARTS", () => {
  it("decides every FurnitureSymbol", () => {
    expect(Object.keys(FURNITURE_PARTS).sort()).toEqual([...FURNITURE_SYMBOLS].sort());
    expect(Object.keys(PART_COUNT).sort()).toEqual([...FURNITURE_SYMBOLS].sort());
    for (const s of FURNITURE_SYMBOLS) expect(FURNITURE_PARTS[s]?.length ?? 0, s).toBe(PART_COUNT[s]);
  });
  it("only a box symbol has parts", () => {
    for (const s of FURNITURE_SYMBOLS) if (FURNITURE_SOLID[s] !== "box") expect(FURNITURE_PARTS[s], s).toBeNull();
  });
  it("every part is inside 0..100 and 0..1, not empty", () => {
    for (const s of FURNITURE_SYMBOLS)
      for (const p of FURNITURE_PARTS[s] ?? []) {
        expect(0 <= p.x0 && p.x0 < p.x1 && p.x1 <= 100, `${s} x`).toBe(true);
        expect(0 <= p.y0 && p.y0 < p.y1 && p.y1 <= 100, `${s} y`).toBe(true);
        expect(0 <= p.z0 && p.z0 < p.z1 && p.z1 <= 1, `${s} z`).toBe(true);
      }
  });
  it("a piece with parts starts at the floor and ends at its top", () => {
    for (const s of FURNITURE_SYMBOLS) {
      const ps = FURNITURE_PARTS[s];
      if (!ps) continue;
      expect(Math.min(...ps.map((p) => p.z0)), s).toBe(0);
      expect(Math.max(...ps.map((p) => p.z1)), s).toBe(1);
    }
  });
  it("no two parts of one piece overlap; touching is fine", () => {
    for (const s of FURNITURE_SYMBOLS) {
      const ps = FURNITURE_PARTS[s] ?? [];
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) expect(partsOverlap(ps[i], ps[j]), `${s} ${i}/${j}`).toBe(false);
    }
  });
  it("partsOverlap: interiors meeting on all three axes overlap, a shared face does not", () => {
    const a: Part = { x0: 0, y0: 0, x1: 50, y1: 50, z0: 0, z1: 0.5 };
    expect(partsOverlap(a, { ...a, x0: 49, x1: 60 })).toBe(true);
    expect(partsOverlap(a, { ...a, x0: 50, x1: 60 })).toBe(false); // touches in x
    expect(partsOverlap(a, { ...a, z0: 0.5, z1: 1 })).toBe(false); // touches in z
    expect(partsOverlap(a, { ...a, y0: 10, y1: 20, z0: 0.4, z1: 0.6 })).toBe(true);
  });
  it("the first part is the tap point: the sofa's back, the table's top, the chair's seat", () => {
    expect(FURNITURE_PARTS.sofa![0]).toEqual({ x0: 0, y0: 0, x1: 100, y1: 28, z0: 0, z1: 1 });
    expect(FURNITURE_PARTS.table![0]).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100, z0: 0.92, z1: 1 });
    expect(FURNITURE_PARTS.chair![0]).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100, z0: 0.5, z1: 0.56 });
  });
});

const floorWith = (furniture: unknown[]): Floor =>
  ({
    title: "T",
    outline: [
      [0, 0],
      [800, 0],
      [800, 600],
      [0, 600],
    ],
    owk: ["external", "external", "external", "external"],
    rooms: [],
    walls: [],
    stairs: [],
    doors: [],
    openings: [],
    extras: [],
    devices: [],
    furniture,
    unlinked: [],
  }) as never;
const prism = (s: Solid) => {
  if (s.shape.type !== "prism") throw new Error("not a prism");
  return s.shape;
};
const centre = (s: Solid): [number, number] => {
  const b = prism(s).base;
  return [b.reduce((a, q) => a + q[0], 0) / b.length, b.reduce((a, q) => a + q[1], 0) / b.length];
};

describe("scene: furniture parts", () => {
  // Asymmetric on purpose (finding 4): w != h, a turn that is not a right angle, a stored height and a lift.
  const sofa = { id: "s", symbol: "sofa", x: 400, y: 300, rot: 30, w: 210, h: 95, height: 80, z: 10 };
  const sol = () => buildScene(floorWith([sofa])).solids.filter((s) => s.kind === "furniture");

  it("a sofa is four solids in table order, all of piece 0", () => {
    const s = sol();
    expect(s.map((x) => x.id)).toEqual(["furniture:0:p0", "furniture:0:p1", "furniture:0:p2", "furniture:0:p3"]);
    for (const x of s) {
      expect(x.ref.index).toBe(0);
      expect(x.tag).toBe("sofa");
      expect(x.paint.role).toBe("furniture-sofa");
    }
  });
  it("parts span the piece's bottom to its top", () => {
    const s = sol(),
      b = furnitureBottom(sofa as never),
      top = b + furnitureHeight(sofa as never);
    expect(b).toBe(10);
    expect(Math.min(...s.map((x) => prism(x).z0))).toBe(b);
    expect(Math.max(...s.map((x) => prism(x).z1))).toBeCloseTo(top, 9);
    expect(prism(s[1]).z1).toBeCloseTo(b + 0.5 * 80, 9); // the seat, half way
  });
  it("the back lies on the turned back side of the centre", () => {
    const back = centre(sol()[0]);
    // Unturned, the back's centre is (0, -0.36 h) from the piece's centre: y0..28 of 100 -> mid at 14, 14 - 50 = -36.
    const dy = (14 / 100 - 0.5) * 95,
      r = (30 * Math.PI) / 180;
    // turnAbout is clockwise on screen (y down), as the 2D `rotate`: (x, y) -> (x cos - y sin, x sin + y cos).
    expect(back[0]).toBeCloseTo(400 - dy * Math.sin(r), 6);
    expect(back[1]).toBeCloseTo(300 + dy * Math.cos(r), 6);
  });
  it("a symbol with no parts is still one solid with the old id", () => {
    const s = buildScene(
      floorWith([{ id: "c", symbol: "cabinet", x: 100, y: 100, rot: 0, w: 100, h: 45 }]),
    ).solids.filter((x) => x.kind === "furniture");
    expect(s.map((x) => x.id)).toEqual(["furniture:0"]);
  });
  it("a linked tv is still one solid carrying its entity", () => {
    const s = buildScene(
      floorWith([{ id: "t", symbol: "tv", x: 100, y: 100, rot: 0, w: 120, h: 10, entity: "media_player.tv" }]),
    ).solids.filter((x) => x.kind === "furniture");
    expect(s).toHaveLength(1);
    expect(s[0].ref.entity).toBe("media_player.tv");
  });
});
