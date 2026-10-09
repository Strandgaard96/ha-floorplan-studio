// The boxes a piece of furniture is drawn with in the 3D view (docs/specs/furniture-parts-3d.md). Footprints are in the
// same 0..100 box as the 2D symbols in icons.ts: x along `w`, y along `h`, y = 0 the symbol's top edge, the back. Heights
// are fractions of the piece's own height, so a stored `height` scales every part and none rises above the top.
// `null` is one box, as before. The first part is where a tap lands (the 3D test hook takes the first solid of a piece).
// 2.5D does not read this: it keeps one box per piece.
import type { FurnitureSymbol } from "./schema";

export interface Part {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
}

const p = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Part => ({
  x0,
  y0,
  x1,
  y1,
  z0,
  z1,
});
/** Four square legs of side `s` in the corners, from the floor to `top`. */
const legs = (s: number, top: number): Part[] => [
  p(0, 0, s, s, 0, top),
  p(100 - s, 0, 100, s, 0, top),
  p(0, 100 - s, s, 100, 0, top),
  p(100 - s, 100 - s, 100, 100, 0, top),
];

export const FURNITURE_PARTS: Record<FurnitureSymbol, readonly Part[] | null> = {
  table: [p(0, 0, 100, 100, 0.92, 1), ...legs(8, 0.92)],
  sofa: [p(0, 0, 100, 28, 0, 1), p(15, 28, 85, 100, 0, 0.5), p(0, 28, 15, 100, 0, 0.7), p(85, 28, 100, 100, 0, 0.7)],
  bed: [p(0, 6, 100, 100, 0, 0.6), p(0, 0, 100, 6, 0, 1), p(8, 10, 44, 24, 0.6, 0.72), p(56, 10, 92, 24, 0.6, 0.72)],
  chair: [p(0, 0, 100, 100, 0.5, 0.56), ...legs(12, 0.5), p(0, 0, 100, 12, 0.56, 1)],
  sink: [
    p(0, 0, 100, 100, 0, 0.9),
    p(0, 0, 100, 20, 0.9, 1),
    p(0, 80, 100, 100, 0.9, 1),
    p(0, 20, 20, 80, 0.9, 1),
    p(80, 20, 100, 80, 0.9, 1),
  ],
  toilet: [p(10, 30, 90, 100, 0, 0.85), p(20, 0, 80, 30, 0, 1)],
  bathtub: [
    p(0, 0, 100, 100, 0, 0.2),
    p(0, 0, 100, 10, 0.2, 1),
    p(0, 90, 100, 100, 0.2, 1),
    p(0, 10, 10, 90, 0.2, 1),
    p(90, 10, 100, 90, 0.2, 1),
  ],
  car: [p(18, 20, 82, 80, 0.55, 1), p(0, 10, 100, 90, 0, 0.55)],
  // One box: plain shapes, or (computer) a default height too low for a desk with a monitor; parts need a height first.
  cabinet: null,
  shower: null,
  tv: null,
  speaker: null,
  computer: null,
  // Not boxes at all (FURNITURE_SOLID): a trunk and two flat slabs.
  tree: null,
  "patio-wood": null,
  "patio-concrete": null,
};

/** Two parts overlap when their interiors meet on all three axes; a shared face or edge is not an overlap. */
export function partsOverlap(a: Part, b: Part): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1;
}
