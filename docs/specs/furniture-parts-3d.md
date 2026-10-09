# Furniture with parts in the 3D view

Status: agreed 2026-10-09 (approach A, 3D only, few boxes).

## Goal

In the card's 3D view a sofa looks like a sofa, not a block. Each furniture
symbol is drawn as a few boxes (seat, back, arms; top and legs), built in code.
No model files, no loader, no new schema field: a layout made today renders
with parts and no change.

## Decided

1. 3D only. 2.5D (`solids.ts`) keeps one box per piece.
2. Few axis boxes per symbol, no round shapes, no bevels.
3. Parts are built in core (`scene-build`), one `Solid` per part, so the
   scene still says exactly what is drawn (approach A). Not a new `Shape`
   type (every `switch` on `shape.type` would change) and not built in the
   viewer only (picking would test a box that is not drawn).
4. The piece's top stays `furnitureBottom + furnitureHeight`. No part rises
   above it: a stored `height` scales every part, and a bed's headboard ends
   at the bed's height (55 cm by default).

## Parts table

`FURNITURE_PARTS` in a new `src/core/furniture-parts.ts`:
`Record<FurnitureSymbol, Part[] | null>`, where
`Part = { x0, y0, x1, y1, z0, z1 }`. Footprint numbers are in the same 0..100
box as the 2D symbols in `icons.ts` (x along `w`, y along `h`, y = 0 is the
back, the top edge of the symbol); z numbers are fractions 0..1 of the piece's
height. `null` means one box, as today.

| symbol | parts (footprint x0,y0,x1,y1 ; z0..z1) |
|---|---|
| table | top 0,0,100,100 ; .92..1 · 4 legs 8x8 in the corners ; 0...92 |
| sofa | back 0,0,100,28 ; 0..1 · seat 15,28,85,100 ; 0...5 · arms 0,28,15,100 and 85,28,100,100 ; 0...7 |
| bed | headboard 0,0,100,6 ; 0..1 · base 0,6,100,100 ; 0...6 · pillows 8,10,44,24 and 56,10,92,24 ; .6...72 |
| chair | 4 legs 12x12 in the corners ; 0...5 · seat 0,0,100,100 ; .5...56 · back 0,0,100,12 ; .56..1 |
| sink | cabinet 0,0,100,100 ; 0...9 · rim strips around the basin 20,20,80,80 ; .9..1 |
| toilet | tank 20,0,80,30 ; 0..1 · bowl 10,30,90,100 ; 0...85 |
| bathtub | floor 0,0,100,100 ; 0...2 · rims 0,0,100,10 and 0,90,100,100 and 0,10,10,90 and 90,10,100,90 ; .2..1 |
| car | body 0,10,100,90 ; 0...55 · cabin 18,20,82,80 ; .55..1 |
| cabinet, shower, tv, speaker, computer | `null` (one box) |
| tree, patio-wood, patio-concrete | not boxes (`FURNITURE_SOLID`), untouched |

Computer stays one box for now: its default height is 50 cm, too low for a
desk with a monitor on it; giving it parts needs a height decision first.

Rule: parts of one piece may touch but never overlap (no coplanar faces
fighting in one colour). Every part lies inside 0..100 and 0..1.

## Scene

`scene-build` furniture loop, for a `"box"` symbol with parts: one solid per
part, id `furniture:${i}:p${k}`, same `kind`, `tag`, `ref` and `paint` as
today's single solid. The part's corners are mapped from 0..100 to the
piece's `w` x `h` around its centre and turned with `turnAbout(…, m.rot, c)`,
as the box is now. A symbol with `null` keeps the single `furniture:${i}`.
Bad input emits nothing, as now; the table itself is ours, but a test checks
it.

## Viewer and picking

- Merged furniture mesh: unchanged, it already takes every furniture prism.
- Linked pieces (`buildPieces`): one body per solid, each looked up by
  `ref.index`, so a linked piece with parts would recolour every part. No
  linked symbol has parts yet.
- Picking: unchanged. A ray between table legs reaches the floor and returns
  the room, which is right. Box tests per tap grow with parts (a table is 5
  solids); `card-3d-perf.spec.ts` must stay green.
- Cut (lowered walls), glow, fx: unchanged, they read prisms.

## Tests (written first, seen to fail)

- Iterate `FURNITURE_SYMBOLS` (finding 17): every symbol is in
  `FURNITURE_PARTS`, as parts or `null` on purpose.
- Every part inside 0..100 / 0..1, z0 < z1, no two parts of one symbol
  overlap.
- Scene: a sofa with asymmetric `w`, `h`, `rot` and stored `height` gives 4
  solids; the back lies along the turned back edge; the highest `z1` equals
  the piece's top; all parts share `ref.index`.
- A `null` symbol still gives one solid `furniture:${i}`.
- The 5000-tables test counts pieces by `ref.index`, not solids.
- Pick: a ray between two table legs returns the room; a ray on the top
  returns the room too.
- Linked piece: tv, speaker and computer are `null`, so a linked piece is
  still one solid with the entity; the existing linked-piece tests stay green
  unchanged.
- `npm run shots` and a look at the 3D view of the demo (finding 16).

## Records

`DECISIONS.md` and `FORK.md` lines in the commit with the work.
