# Furniture Parts in 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the card's 3D view, draw table, sofa, bed, chair, sink, toilet, bathtub and car as a few boxes each instead of one block.

**Architecture:** A pure data table `FURNITURE_PARTS` (new `src/core/furniture-parts.ts`) gives each symbol its boxes in the 2D symbol's 0..100 footprint and 0..1 height fractions. The 3D scene builder (`src/core/scene-build.ts`) emits one `Solid` per part with the piece's `ref` and `paint`. The viewer, picker and cut code read prisms already and do not change.

**Tech Stack:** TypeScript, vitest, Playwright, three.js (untouched).

**Spec:** `docs/specs/furniture-parts-3d.md` — read it first; it has the full parts table and the mapping formulas.

## Global Constraints

- Read `CLAUDE.md` (repo root) before starting; its numbered findings are rules.
- Branch `task/furniture-parts` (exists). Small commits, imperative subject, body says why, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- English in files, metric units, ISO dates.
- 3D only: `src/core/solids.ts` (2.5D) is not changed.
- No new schema field, no change to `validate`/`migrate`.
- `scene-build.ts` never throws; a piece that cannot be built is skipped.
- Run commands bare and read `$?` on its own line (finding 14). Never report green you did not see (finding 7).
- Write each test first and watch it fail (finding 5); say so in the report.

## Review Focus

1. A piece with `rot` not a multiple of 90 and `w != h`: parts must turn with the piece, back stays on the turned back side (Task 2 sofa test uses rot 30, w 210, h 95).
2. A stored `height` and `z` (a raised piece): every part scales, lowest part at `z`, highest at `z + height` (Task 2 test uses `height: 80, z: 10`).
3. A linked tv/speaker/computer still one solid with its entity (Task 2 keeps existing linked tests green and asserts the count).
4. 5000 tables: build stays under 2 s with 25 000 solids (Task 2 budget test).
5. A tap under a table top between legs lands on the room, not "other" (Task 2 pick test).

---

### Task 1: The parts table

**Files:**
- Create: `src/core/furniture-parts.ts`
- Test: `tests/core/furniture-parts.test.ts` (create)

**Interfaces:**
- Produces: `export interface Part { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number }` and `export const FURNITURE_PARTS: Record<FurnitureSymbol, readonly Part[] | null>`, plus `export function partsOverlap(a: Part, b: Part): boolean`.

- [ ] **Step 1: Write the failing test** — `tests/core/furniture-parts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, see it fail**

Run: `npx vitest run tests/core/furniture-parts.test.ts`
Expected: FAIL, cannot resolve `../../src/core/furniture-parts`.

- [ ] **Step 3: Write the table** — `src/core/furniture-parts.ts`:

```ts
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

const p = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Part => ({ x0, y0, x1, y1, z0, z1 });
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
  car: [p(0, 10, 100, 90, 0, 0.55), p(18, 20, 82, 80, 0.55, 1)],
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
```

Note the sofa: its back (y 0..28) and the arms (y 28..100) touch at y = 28, and the seat lies between the arms; the chair's seat (z .5..56) sits on the legs (z 0..5) and under the back (z .56..1).

- [ ] **Step 4: Run it, see it pass**

Run: `npx vitest run tests/core/furniture-parts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Break it once (finding 4).** Change the sofa seat to `p(14, 28, 85, 100, 0, 0.5)`, rerun, see "no two parts … overlap" fail on `sofa 1/2`, revert.

- [ ] **Step 6: Commit**

```bash
git add src/core/furniture-parts.ts tests/core/furniture-parts.test.ts
git commit -m "Add the 3D parts table for furniture"
```
(body: why — a sofa in 3D is one block; the table gives each symbol a few boxes in the 2D symbol's frame.)

---

### Task 2: The scene emits one solid per part

**Files:**
- Modify: `src/core/scene-build.ts` (import near the top; furniture loop around line 648-683)
- Modify: `src/card/three/pick.ts:9-10` (comment only)
- Modify: `tests/core/scene.test.ts` (around lines 705-725, 918, 1094)
- Modify: `tests/core/scene-budget.test.ts` (add one case)
- Modify: `tests/card/three-pick.test.ts` (add one describe)
- Test: `tests/core/furniture-parts.test.ts` (add a scene describe)

**Interfaces:**
- Consumes: `FURNITURE_PARTS`, `Part` from Task 1.
- Produces: furniture solids with ids `furniture:${i}:p${k}` for a symbol with parts, `furniture:${i}` otherwise; every part has the piece's `kind: "furniture"`, `tag: symbol`, `ref`, `paint`.

`FURNITURE_PARTS` is imported directly into `scene-build.ts` (`import { FURNITURE_PARTS } from "./furniture-parts";`), not through `SceneDeps`: the card does not use it, so the 3D chunk is the only place it lives. That is the rule the comment at `scene-build.ts:13-15` states.

- [ ] **Step 1: Write the failing scene tests.** Append to `tests/core/furniture-parts.test.ts`:

```ts
import { buildScene, type Solid } from "../../src/core/scene";
import { furnitureBottom, furnitureHeight } from "../../src/core/heights";
import type { Floor } from "../../src/core/schema";

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
    // Unturned, the back's centre is (0, -0.36 h) from the piece's centre: y0..28 of 100 → mid at 14, 14 - 50 = -36.
    const dy = (14 / 100 - 0.5) * 95,
      r = (30 * Math.PI) / 180;
    // turnAbout is clockwise on screen (y down), as the 2D `rotate`: (x, y) → (x cos − y sin, x sin + y cos).
    expect(back[0]).toBeCloseTo(400 - dy * Math.sin(r), 6);
    expect(back[1]).toBeCloseTo(300 + dy * Math.cos(r), 6);
  });
  it("a symbol with no parts is still one solid with the old id", () => {
    const s = buildScene(floorWith([{ id: "c", symbol: "cabinet", x: 100, y: 100, rot: 0, w: 100, h: 45 }])).solids.filter(
      (x) => x.kind === "furniture",
    );
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
```

Check the sign convention against `turnAbout` in `src/core/solids.ts:524` before you run it; if `turnAbout` turns the other way, fix the expected formula in the test (not the code), and say so in the report.

- [ ] **Step 2: Run, see the scene tests fail**

Run: `npx vitest run tests/core/furniture-parts.test.ts`
Expected: the "scene: furniture parts" tests FAIL (ids are `["furniture:0"]`); "a symbol with no parts" and "a linked tv" PASS already.

- [ ] **Step 3: Implement.** In `src/core/scene-build.ts`, add `import { FURNITURE_PARTS } from "./furniture-parts";` after the `debugOnce` import, and replace the body of the furniture `piece(() => { … })` after the guard with:

```ts
        const z0 = furnitureBottom(m as never),
          H = furnitureHeight(m as never),
          c: Pt = [m.x, m.y],
          symbol = m.symbol as FurnitureSymbol,
          pole = FURNITURE_SOLID[symbol] === "pole",
          parts = FURNITURE_SOLID[symbol] === "box" ? FURNITURE_PARTS[symbol] : null;
        // A linked tv, speaker or computer (`pieceDevice`) carries its entity and its own colour: the viewer recolours it by state and hands a tap on it to the gesture code.
        const linked = pieceDevice(m as never);
        const ref = { index: i, id: text(m.id), size: [m.w, m.h] as Pt, ...(linked ? { entity: linked.entity } : {}) },
          paint = { role: linked ? "furniture-linked" : `furniture-${m.symbol}` };
        // A corner in the symbol's 0..100 box, on the plan, turned with the piece.
        const at = (x: number, y: number): Pt => turnAbout([m.x + (x / 100 - 0.5) * m.w, m.y + (y / 100 - 0.5) * m.h], m.rot, c);
        if (parts) {
          parts.forEach((p, k) =>
            add(
              "furniture",
              `furniture:${i}:p${k}`,
              m.symbol,
              { type: "prism", base: [at(p.x0, p.y0), at(p.x1, p.y0), at(p.x1, p.y1), at(p.x0, p.y1)], z0: z0 + p.z0 * H, z1: z0 + p.z1 * H },
              ref,
              paint,
            ),
          );
          return;
        }
        const half = pole ? [TRUNK_SIDE / 2, TRUNK_SIDE / 2] : [m.w / 2, m.h / 2];
        const base = (
          [
            [-half[0], -half[1]],
            [half[0], -half[1]],
            [half[0], half[1]],
            [-half[0], half[1]],
          ] as Pt[]
        ).map((q) => turnAbout([c[0] + q[0], c[1] + q[1]], pole ? 0 : m.rot, c));
        add("furniture", `furniture:${i}`, m.symbol, { type: "prism", base, z0, z1: z0 + H }, ref, paint);
```

Check the existing `ref` and `paint` objects the old code passed (and the type `add` expects for them, including whether `size` is typed as `Pt` or `[number, number]`); keep their exact shape and key order. Also fix the stale comment above the loop: the tree's crown is not drawn from `ref.size` (nothing in `src/card/three` reads it); write "Furniture: boxes by FURNITURE_PARTS, a trunk (a tree) or a flat slab, by FURNITURE_SOLID."

- [ ] **Step 4: Run the new tests, see them pass**

Run: `npx vitest run tests/core/furniture-parts.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the tests that pinned one solid per piece.** Run `npx vitest run tests/core/scene.test.ts` first and see which fail (expected: "decides every FurnitureSymbol", the demo's "2 furniture", the 5000 pieces). Then:

In "decides every FurnitureSymbol" (around line 713), replace from `const sol = …` to the end of the loop body with:

```ts
      const sol = sc.solids.filter((x) => x.kind === "furniture");
      const parts = FURNITURE_PARTS[s];
      expect(sol, s).toHaveLength(parts?.length ?? 1);
      for (const x of sol) {
        expect(x.tag).toBe(s);
        expect(x.ref.index).toBe(0);
      }
      expect(Math.min(...sol.map((x) => prism(x).z0))).toBe(furnitureBottom(m as never));
      expect(Math.max(...sol.map((x) => prism(x).z1))).toBeCloseTo(
        furnitureBottom(m as never) + furnitureHeight(m as never),
        9,
      );
      if (SYMBOL_DECISION[s] === "pole") {
        expect(area(sol[0])).toBeLessThan((m.w * m.h) / 10);
        expect(sol[0].ref.size).toEqual([120, 70]);
      } else if (!parts) expect(round(area(sol[0]))).toBe(120 * 70);
```
and add `import { FURNITURE_PARTS } from "../../src/core/furniture-parts";` at the top.

Around line 918, replace `expect(g.solids.filter((s) => s.kind === "furniture")).toHaveLength(2);` with
```ts
    expect(new Set(g.solids.filter((s) => s.kind === "furniture").map((s) => s.ref.index)).size).toBe(2);
```
Around line 1094, replace the 5000 assertion with
```ts
    expect(new Set(sc.solids.filter((s) => s.kind === "furniture").map((s) => s.ref.index)).size).toBe(5000);
```
Run `npx vitest run tests/core/scene.test.ts`; expected PASS. Any other failure: stop and report it, do not loosen it.

- [ ] **Step 6: Budget test.** Add to `tests/core/scene-budget.test.ts`, inside the describe:

```ts
  it("5000 tables (25 000 parts) build in under 2 s", () => {
    const furniture = Array.from({ length: 5000 }, (_, i) => ({
      id: `f${i}`,
      symbol: "table",
      x: (i % 100) * 10,
      y: Math.floor(i / 100) * 10,
      rot: i % 360,
      w: 50,
      h: 50,
    }));
    const t = performance.now();
    const scene = buildScene({ ...floorOf([]), furniture } as never);
    const ms = performance.now() - t;
    expect(ms, `took ${Math.round(ms)} ms`).toBeLessThan(2000);
    expect(scene.solids.filter((s) => s.kind === "furniture")).toHaveLength(25000);
  });
```
Run `npx vitest run tests/core/scene-budget.test.ts`; expected PASS. Put the measured ms in the report.

- [ ] **Step 7: Pick test.** Add to `tests/card/three-pick.test.ts`:

```ts
describe("Picker: a table drawn as a top and four legs", () => {
  // Table in room A (x 0..300): centre (150, 250), 100 x 100, 75 cm high → top 69..75 cm, legs 8 cm square.
  const p = new Picker(
    buildScene(house({ furniture: [{ id: "t", symbol: "table", x: 150, y: 250, rot: 0, w: 100, h: 100 }] as never }))
      .solids,
  );
  it("a ray down onto the top picks the room the table stands in", () => {
    expect(p.pick(down(150, 250), plain)).toEqual({ type: "room", index: 0 });
  });
  it("a level ray under the top, between two legs, reaches the floor of the same room", () => {
    // From the west, 30 cm up, sloping to the floor under the table's middle: passes between the legs at y 250.
    expect(p.pick(through([-400, 250, 40], [150, 250, 0]), plain)).toEqual({ type: "room", index: 0 });
  });
  it("a ray into a leg stops there and still reads as the room", () => {
    // Leg at x 100..108, y 200..208; aim at its middle, 20 cm up, from the west.
    expect(p.pick(through([-400, 204, 20], [104, 204, 20]), plain)).toEqual({ type: "room", index: 0 });
  });
});
```
The west wall stands at x = 0, 250 cm high, and the rays start at x = -400 below its top, so they would hit the wall: start them inside the house instead (`[5, 250, 40]` and `[5, 204, 20]`), targets unchanged. Run `npx vitest run tests/card/three-pick.test.ts`; PASS.

These three cases are a regression guard, not the failing-first test: with one box the result is also `room 0`, because furniture on a room reads as that room either way. The scene tests of Step 1 are the tests that fail without the feature. Say so in the report; do not invent a hook on `Picker` to tell them apart.

- [ ] **Step 8: Comment.** In `src/card/three/pick.ts:9-10`, change "so 5000 pieces of furniture cost 5000 box tests per tap" to "so 5000 tables (a top and four legs each) cost 25 000 box tests per tap".

- [ ] **Step 9: Full unit suite**

Run: `npx vitest run`
Then on its own line: `echo $?`
Expected: 0. Any failure: report it with output.

- [ ] **Step 10: Commit**

```bash
git add src/core/scene-build.ts src/card/three/pick.ts tests/core/furniture-parts.test.ts tests/core/scene.test.ts tests/core/scene-budget.test.ts tests/card/three-pick.test.ts
git commit -m "Build furniture in 3D from its parts"
```

---

### Task 3: Look at it, measure it, write it down

**Files:**
- Modify: `scripts/shots.mjs` (a derived layout and two 3D shots)
- Modify: `docs/DECISIONS.md` (new entry at top), `FORK.md` (new entry at top), `docs/card.md` ("3D view" section, ~line 766)

- [ ] **Step 1: Shots fixture.** In `scripts/shots.mjs`, after `texLayout` is built, add a `furnLayout`: `structuredClone(layout)` with the ground floor's `furniture` extended by one piece of every symbol that has parts (table, sofa, bed, chair, sink, toilet, bathtub, car), placed in a row inside the demo's ground outline where they do not cover the existing furniture (read `demo/layout.json` floors.ground for free floor; ids `furn-<symbol>`, default `w`/`h` from `FURNITURE` in `src/core/icons.ts`, `rot` 0 except the sofa at 30). Add a second sofa with `height: 120` to show the scaling. Add `shots3d` entries `card-ground-furniture-${t.id}-3d` and `…-3d-orbit` for blueprint and light, with `layout: furnLayout` (extend the `layout:` selector in the config with an `s.furn` flag, the way `s.tex` works).

- [ ] **Step 2: Render and look.**

Run: `npm run shots`
Then on its own line: `echo $?`
Open `shots/current/card-ground-furniture-light-3d.png`, `…-3d-orbit.png` and the blueprint pair with the Read tool and look: every piece reads as what it is, the sofa back is on its back edge, legs are visible under the table and chair, nothing floats or pokes through. Also look at `card-ground-on-light-3d.png` (the demo's own sofa and table). If something looks wrong, fix the table in `furniture-parts.ts` (and its tests) and render again. Describe what you saw in the report; do not claim a look you did not do.

- [ ] **Step 3: Perf.** Run `PW_PORT=5274 npx playwright test tests/card/card-3d-perf.spec.ts tests/card/card-3d.spec.ts tests/card/card-3d-pick.spec.ts tests/card/card-3d-linked-piece.spec.ts`, then `echo $?` on its own line. Expected 0. Copy any build/pick timings these specs print into the report. Compare with the same run on `main` (`git stash` is not needed: run them on main in a worktree only if timings are printed; otherwise report the pass/fail).

- [ ] **Step 4: Records.**

`docs/DECISIONS.md`, new top entry:

```markdown
## 2026-10-09: furniture is a few boxes in 3D

A sofa, table, bed, chair, sink, toilet, bathtub and car are drawn in the 3D view as a few boxes each (`FURNITURE_PARTS`, `src/core/furniture-parts.ts`; spec `docs/specs/furniture-parts-3d.md`). Footprints are in the 2D symbol's 0..100 box, heights are fractions of the piece's height, so a stored `height` scales every part and nothing rises above the top. The scene emits one solid per part (`furniture:i:pk`) with the piece's ref and paint; viewer, picker and cut are unchanged. Cabinet, shower, tv, speaker and computer stay one box (computer: its 50 cm default is too low for a desk with a monitor). 2.5D keeps one box per piece: this widens the gap between the 2.5D and 3D draw paths, against the spirit of finding 8; the 3D scene was already its own path. Squat by design: a bed's headboard ends at 55 cm, a toilet's tank at 40 cm.
```

`FORK.md`, new top entry under the intro (same style as the existing entry):

```markdown
## 2026-10-09: Furniture parts in 3D (branch `task/furniture-parts`)

- 3D view draws table, sofa, bed, chair, sink, toilet, bathtub and car as a few boxes each instead of one block (`src/core/furniture-parts.ts`, `src/core/scene-build.ts`). 2.5D unchanged.
```

`docs/card.md`, in the "3D view" first paragraph, after "stairs, furniture,": change "furniture" to "furniture (a sofa, table, bed, chair, sink, toilet, bathtub or car as a few boxes: seat, back and arms, top and legs; anything else one block)".

- [ ] **Step 5: Full check**

Run: `task check`
Then `echo $?` on its own line. Expected 0. Report the output tail if not.

- [ ] **Step 6: Commit**

```bash
git add scripts/shots.mjs docs/DECISIONS.md FORK.md docs/card.md
git commit -m "Shoot every furniture part in 3D and record the decision"
```
