# Furniture with parts in the 3D view

Status: agreed 2026-10-09 (approach A, 3D only, few boxes). Reviewed the same
day; findings folded in.

## Goal

In the card's 3D view a sofa looks like a sofa, not a block. Each furniture
symbol is drawn as a few boxes (seat, back, arms; top and legs), built in code.
No model files, no loader, no new schema field: a layout made today renders
with parts and no change.

## Decided

1. 3D only. 2.5D (`solids.ts`) keeps one box per piece. This departs from the
   spirit of finding 8 (one draw path): the 3D scene is already its own path
   (`scene-build`), and this widens the gap between 2.5D and 3D. Said in the
   DECISIONS entry.
2. Few axis boxes per symbol, no round shapes, no bevels.
3. Parts are built in core (`scene-build`), one `Solid` per part, so the
   scene still says exactly what is drawn. Not a new `Shape` type (every
   `switch` on `shape.type` would change) and not built in the viewer only
   (picking would test a box that is not drawn).
4. The piece's top stays `furnitureBottom + furnitureHeight`. No part rises
   above it and the lowest part starts at the bottom: a stored `height` scales
   every part. A bed's headboard ends at the bed's height (55 cm by default);
   a toilet's tank ends at 40 cm, beside a 34 cm bowl. Both read squat;
   accepted, a later height decision like the computer's.

## Parts table

`FURNITURE_PARTS` in a new `src/core/furniture-parts.ts`:
`Record<FurnitureSymbol, readonly Part[] | null>` covering the whole union,
`Part = { x0, y0, x1, y1, z0, z1 }`.

- Footprint numbers are in the same 0..100 box as the 2D symbols in
  `icons.ts`: x along `w`, y along `h`, y = 0 is the symbol's top edge, the
  back (the 2D transform is `rotate scale(w/100,h/100) translate(-50 -50)`,
  `solids.ts:643`).
- z numbers are fractions 0..1 of the piece's height.
- `null` means one box, as today. tree, patio-wood and patio-concrete are
  `null` too; scene code reads the table only when
  `FURNITURE_SOLID[symbol] === "box"`.
- **Order matters.** Parts are emitted in table order, and the first row is
  the part whose top centre is the natural tap point: the test hook
  `where(kind, index)` (`view3d.ts:1307`) takes the first solid with that
  index, and three Playwright specs tap there.

| symbol | parts in order: x0,y0,x1,y1 ; z0..z1 |
|---|---|
| table | top 0,0,100,100 ; .92..1 · legs 0,0,8,8 · 92,0,100,8 · 0,92,8,100 · 92,92,100,100 ; 0..92 |
| sofa | back 0,0,100,28 ; 0..1 · seat 15,28,85,100 ; 0..5 · arms 0,28,15,100 · 85,28,100,100 ; 0..7 |
| bed | base 0,6,100,100 ; 0..6 · headboard 0,0,100,6 ; 0..1 · pillows 8,10,44,24 · 56,10,92,24 ; .6..72 |
| chair | seat 0,0,100,100 ; .5..56 · legs 0,0,12,12 · 88,0,100,12 · 0,88,12,100 · 88,88,100,100 ; 0..5 · back 0,0,100,12 ; .56..1 |
| sink | cabinet 0,0,100,100 ; 0..9 · rims 0,0,100,20 · 0,80,100,100 · 0,20,20,80 · 80,20,100,80 ; .9..1 |
| toilet | bowl 10,30,90,100 ; 0..85 · tank 20,0,80,30 ; 0..1 |
| bathtub | floor 0,0,100,100 ; 0..2 · rims 0,0,100,10 · 0,90,100,100 · 0,10,10,90 · 90,10,100,90 ; .2..1 |
| car | cabin 18,20,82,80 ; .55..1 · body 0,10,100,90 ; 0..55 |
| cabinet, shower, tv, speaker, computer, tree, patio-wood, patio-concrete | `null` |

(`.92` means 0.92; `0..92` means 0 to 0.92.)

Computer stays one box: its default height is 50 cm, too low for a desk with
a monitor on it; parts need a height decision first.

**Overlap**, for the rule "parts of one piece may touch but never overlap":
two parts overlap when their interiors meet on all three axes,
`a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1`.
Touching is allowed. Every part has `0 <= x0 < x1 <= 100`, the same for y,
and `0 <= z0 < z1 <= 1`. Every symbol with parts has a part with `z0 = 0` and
one with `z1 = 1`.

## Scene

In the `scene-build` furniture loop (`scene-build.ts:648`), for a `"box"`
symbol whose `FURNITURE_PARTS` entry is an array, emit one solid per part `k`,
id `furniture:${i}:p${k}`, with the same `kind`, `tag`, `ref` and `paint` as
today's single solid. With `b = furnitureBottom(m)`, `H = furnitureHeight(m)`
and `c = [m.x, m.y]`:

- corner `(x, y)` → `[m.x + (x/100 − 0.5)·m.w, m.y + (y/100 − 0.5)·m.h]`,
  then `turnAbout(p, m.rot, c)`;
- corners in the order `[x0,y0], [x1,y0], [x1,y1], [x0,y1]`, as the box
  has now, so the winding of `prismTriangles` is unchanged
  (`three-mesh.test.ts:30`);
- `z0 = b + part.z0·H`, `z1 = b + part.z1·H`.

A `null` entry keeps the single `furniture:${i}`. Bad input emits nothing,
as now.

## Viewer and picking

- Merged furniture mesh: unchanged, it groups prisms by colour
  (`view3d.ts:555-600`).
- Linked pieces (`buildPieces`, `view3d.ts:903`): one body per solid, each
  looked up by `ref.index`. tv, speaker and computer are `null`, so a linked
  piece is still one solid.
- Picking: unchanged. A ray between table legs reaches the floor and returns
  the room. Box tests per tap grow with parts (a table is 5 solids): update
  the "5000 box tests" comment (`pick.ts:9-10`) to the new figure.
- Cut, glow, fx, room-info, live-build: do not read furniture solids,
  unchanged. `ref.size` is read by nothing in `src/card/three`; the "crown"
  comment at `scene-build.ts:648` is stale, fix it in passing.

## Tests (written first, seen to fail)

- New `tests/core/furniture-parts.test.ts`:
  - iterate `FURNITURE_SYMBOLS` (finding 17): every symbol has an entry,
    and every `"pole"`/`"flat"` symbol is `null`;
  - every part within bounds, no two parts of one symbol overlap (the
    definition above), a part at `z0 = 0` and one at `z1 = 1`;
  - scene: a sofa with asymmetric `w = 210`, `h = 95`, `rot = 30` and stored
    `height = 80` gives 4 solids in table order, ids `furniture:0:p0..p3`;
    the back's centre lies on the turned back side of the centre; max `z1`
    is the piece's top, min `z0` its bottom; all share `ref.index = 0`.
- Rewrite `tests/core/scene.test.ts:713-722` ("decides every
  FurnitureSymbol"): `sol.length === (FURNITURE_PARTS[s]?.length ?? 1)`,
  every `ref.index === 0`, max `z1` = top, min `z0` = bottom; the full-area
  check only for `null` box symbols.
- `scene.test.ts:918`: the demo's furniture is counted by distinct
  `ref.index` (2), not solids.
- `scene.test.ts:1094` (5000 tables): count distinct `ref.index`.
- `scene-budget.test.ts`: 5000 tables build in under 2 s.
- Pick (`three-pick.test.ts`): a ray down between two table legs, under the
  top, is impossible (the top covers them), so a ray at a low angle under
  the top between two legs returns the room; a ray onto the top returns the
  room.
- Linked-piece tests stay green unchanged.
- Report measured build and pick times from `card-3d-perf.spec.ts:299` and
  `card-3d.spec.ts:237` before and after.
- Look (finding 16): `npm run shots` draws only the demo's sofa and table.
  Add a shot (or a fixture) that places every parts symbol, at its default
  and at a custom `height`, and look at it in 3D.

## Records

`DECISIONS.md` (with the finding-8 note) and `FORK.md` lines in the commit
with the work. `docs/card.md` "3D view" section: furniture is drawn as a few
boxes per piece.
