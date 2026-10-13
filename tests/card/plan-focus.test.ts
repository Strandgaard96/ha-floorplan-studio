import { describe, expect, it } from "vitest";
import { firstFocus, nextInDirection, type FocusDir } from "../../src/card/plan-focus";

const DIRS: FocusDir[] = ["right", "left", "up", "down"];
const P = (x: number, y: number) => ({ x, y });
const next = (pts: unknown[], from: number, dir: FocusDir) => nextInDirection(pts as never, from, dir);

describe("nextInDirection: a 5 x 5 grid turned 45 degrees about [37, -12]", () => {
  // Grid point (i, j), spacing 10, index j * 5 + i. Turned 45 degrees on a screen with y down:
  //   x = 37 + 10 (i - j) / sqrt2,  y = -12 + 10 (i + j) / sqrt2.
  // So on screen "right" is i - j growing and "down" is i + j growing. Worked by hand, in grid steps (di, dj):
  //   right: (+1,-1) lies straight right, cost 14.1; else (+1,0) or (0,-1), both on the cone edge at cost 21.2 (a tie, lower index);
  //   left:  (-1,+1), else (-1,0) or (0,+1);   down: (+1,+1), else (+1,0) or (0,+1);   up: (-1,-1), else (-1,0) or (0,-1).
  // A point with none of those has nothing in that direction (the corner at the end of an edge).
  const S = 10 / Math.SQRT2;
  const idx = (i: number, j: number) => j * 5 + i;
  const grid = Array.from({ length: 25 }, (_, n) => {
    const i = n % 5, j = Math.floor(n / 5);
    return P(37 + S * (i - j), -12 + S * (i + j));
  });
  const steps: Record<FocusDir, [number, number][]> = {
    right: [[1, -1], [1, 0], [0, -1]],
    left: [[-1, 1], [-1, 0], [0, 1]],
    down: [[1, 1], [1, 0], [0, 1]],
    up: [[-1, -1], [-1, 0], [0, -1]],
  };
  const byHand = (i: number, j: number, dir: FocusDir): number => {
    const [straight, ...edge] = steps[dir];
    const inside = ([a, b]: number[]) => i + a >= 0 && i + a < 5 && j + b >= 0 && j + b < 5;
    if (inside(straight)) return idx(i + straight[0], j + straight[1]);
    const found = edge.filter(inside).map(([a, b]) => idx(i + a, j + b));
    return found.length ? Math.min(...found) : idx(i, j);
  };
  for (const dir of DIRS) {
    it(`every point to the ${dir}`, () => {
      for (let n = 0; n < 25; n++) {
        const i = n % 5, j = Math.floor(n / 5);
        expect(next(grid, n, dir), `(${i},${j}) ${dir}`).toBe(byHand(i, j, dir));
      }
    });
  }
  it("a few answers stated outright", () => {
    expect(next(grid, idx(2, 2), "right")).toBe(idx(3, 1));
    expect(next(grid, idx(0, 0), "right")).toBe(idx(1, 0)); // the tie (1,0) / none: only (1,0) exists
    expect(next(grid, idx(4, 4), "down")).toBe(idx(4, 4)); // the bottom corner: none, so itself
    expect(next(grid, idx(4, 0), "right")).toBe(idx(4, 0)); // the right corner
    expect(next(grid, idx(2, 0), "down")).toBe(idx(3, 1));
    expect(next(grid, idx(2, 0), "left")).toBe(idx(1, 1));
  });
  it("the tie goes to the lower index, whatever order the points come in", () => {
    // From (2,2) to the right with (3,1) removed, (3,2) and (2,1) tie at 21.2.
    const keep = (n: number) => n !== idx(3, 1);
    const ids = grid.map((_, n) => n).filter(keep);
    const pts = ids.map((n) => grid[n]);
    const from = ids.indexOf(idx(2, 2));
    expect(ids[next(pts, from, "right")]).toBe(idx(2, 1));
    const rev = [...ids].reverse();
    const rpts = rev.map((n) => grid[n]);
    // reversed order: the lower index is now the other point
    expect(rev[next(rpts, rev.indexOf(idx(2, 2)), "right")]).toBe(idx(3, 2));
  });
});

describe("nextInDirection: cone and cost", () => {
  it("takes a point inside the 45 degree cone and not one outside", () => {
    const pts = [P(0, 0), P(10, 12), P(10, 9)];
    expect(next(pts, 0, "right")).toBe(2); // 12 across on 10 along is outside; 9 across is inside
    expect(next([P(0, 0), P(10, 12)], 0, "right")).toBe(0);
  });
  it("the cone's edge is in", () => {
    expect(next([P(0, 0), P(10, 10)], 0, "right")).toBe(1);
    expect(next([P(0, 0), P(10, -10)], 0, "right")).toBe(1);
  });
  it("cost is along plus twice across: a straighter far point beats a nearer slanted one", () => {
    // (10, 9): 10 + 18 = 28. (25, 0): 25. The farther, straight point wins.
    expect(next([P(0, 0), P(10, 9), P(25, 0)], 0, "right")).toBe(2);
    // (10, 3): 16 beats (25, 0): 25.
    expect(next([P(0, 0), P(10, 3), P(25, 0)], 0, "right")).toBe(1);
  });
  it("collinear points walk to the nearest, then stop at the end", () => {
    const row = [P(0, 5), P(30, 5), P(10, 5), P(20, 5)];
    expect(next(row, 0, "right")).toBe(2);
    expect(next(row, 2, "right")).toBe(3);
    expect(next(row, 3, "right")).toBe(1);
    expect(next(row, 1, "right")).toBe(1);
    expect(next(row, 1, "left")).toBe(3);
    expect(next(row, 0, "down")).toBe(0);
  });
  it("two at equal cost: the lower index", () => {
    expect(next([P(0, 0), P(10, 5), P(10, -5)], 0, "right")).toBe(1);
    expect(next([P(0, 0), P(10, -5), P(10, 5)], 0, "right")).toBe(1);
    expect(next([P(10, -5), P(0, 0), P(10, 5)], 1, "right")).toBe(0);
  });
  it("screen y grows downwards", () => {
    const pts = [P(0, 0), P(0, 10), P(0, -10)];
    expect(next(pts, 0, "down")).toBe(1);
    expect(next(pts, 0, "up")).toBe(2);
  });
  it("a point on top of the origin is never the answer", () => {
    expect(next([P(3, 3), P(3, 3), P(9, 3)], 0, "right")).toBe(2);
    expect(next([P(3, 3), P(3, 3)], 0, "right")).toBe(0);
  });
});

describe("nextInDirection: odd input", () => {
  it("one point, none, a bad from", () => {
    expect(next([P(1, 1)], 0, "right")).toBe(0);
    expect(next([], 0, "right")).toBe(0);
    expect(next([P(0, 0), P(5, 0)], 7, "right")).toBe(7);
    expect(next([P(0, 0), P(5, 0)], -1, "right")).toBe(-1);
    expect(next([P(0, 0), P(5, 0)], 0.5, "right")).toBe(0.5);
  });
  it("junk points are skipped, and a junk origin stays put", () => {
    const junk = [P(0, 0), P(NaN, 0), P(Infinity, 0), null, undefined, 5, "x", { x: "1", y: 0 }, {}, { x: 1 }, P(8, 0)];
    expect(next(junk, 0, "right")).toBe(10);
    expect(next(junk, 1, "right")).toBe(1);
    expect(next(junk, 3, "left")).toBe(3);
    expect(next(junk, 10, "left")).toBe(0);
  });
  it("an unknown direction stays put", () => {
    expect(next([P(0, 0), P(5, 0)], 0, "sideways" as FocusDir)).toBe(0);
  });
});

describe("firstFocus", () => {
  it("is the point nearest the centre", () => {
    expect(firstFocus([P(0, 0), P(10, 10), P(4, 3)] as never, P(5, 5))).toBe(2);
    expect(firstFocus([P(0, 0), P(100, 100)] as never, P(60, 60))).toBe(1);
  });
  it("a tie goes to the lower index", () => {
    expect(firstFocus([P(10, 0), P(-10, 0)] as never, P(0, 0))).toBe(0);
    expect(firstFocus([P(-10, 0), P(10, 0)] as never, P(0, 0))).toBe(0);
  });
  it("none for an empty or all-junk list; junk skipped", () => {
    expect(firstFocus([], P(0, 0))).toBe(-1);
    expect(firstFocus([P(NaN, 1), null] as never, P(0, 0))).toBe(-1);
    expect(firstFocus([P(NaN, 1), P(50, 50)] as never, P(0, 0))).toBe(1);
  });
  it("a junk centre takes the first good point", () => {
    expect(firstFocus([P(NaN, 1), P(5, 5), P(0, 0)] as never, P(NaN, 0))).toBe(1);
    expect(firstFocus([P(5, 5)] as never, null as never)).toBe(0);
  });
});
