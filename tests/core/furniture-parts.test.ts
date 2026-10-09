import { describe, expect, it } from "vitest";
import { FURNITURE_PARTS, partsOverlap, type Part } from "../../src/core/furniture-parts";
import { FURNITURE_SOLID } from "../../src/core/solids";
import { FURNITURE_SYMBOLS, type FurnitureSymbol } from "../../src/core/schema";

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
