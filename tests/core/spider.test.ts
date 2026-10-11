import { describe, expect, it } from "vitest";
import { renderFloor } from "../../src/core/render";
import { SPIDER_GAP_PX, spiderLayout, stackGroups } from "../../src/core/spider";

describe("stackGroups (S25.5)", () => {
  it("is empty for no points and for one", () => {
    expect(stackGroups([], 10)).toEqual([]);
    expect(stackGroups([[5, 5]], 10)).toEqual([]);
  });
  it("groups two points closer than minDist and leaves a far one out", () => {
    expect(
      stackGroups(
        [
          [0, 0],
          [100, 100],
          [6, 0],
        ],
        10,
      ),
    ).toEqual([[0, 2]]);
  });
  it("chains: a-b and b-c close, a-c far, is one group of three", () => {
    expect(
      stackGroups(
        [
          [0, 0],
          [8, 0],
          [16, 0],
          [200, 0],
        ],
        10,
      ),
    ).toEqual([[0, 1, 2]]);
  });
  it("makes two separate groups, by first index", () => {
    expect(
      stackGroups(
        [
          [0, 0],
          [500, 0],
          [3, 0],
          [503, 0],
        ],
        10,
      ),
    ).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
  it("skips junk points and junk minDist without throwing", () => {
    const junk = [[NaN, 0], [0, Infinity], null, undefined, "x", [1], [1, 2, 3], { x: 1 }, [0, 0], [4, 0]] as unknown[];
    expect(stackGroups(junk, 10)).toEqual([[8, 9]]);
    for (const m of [NaN, -1, 0, Infinity, "5", null, undefined])
      expect(
        stackGroups(
          [
            [0, 0],
            [1, 0],
          ],
          m as never,
        ),
      ).toEqual([]);
    expect(stackGroups(5 as never, 10)).toEqual([]);
    expect(stackGroups(null as never, 10)).toEqual([]);
  });
  it("two points exactly minDist apart are not a stack", () => {
    expect(
      stackGroups(
        [
          [0, 0],
          [10, 0],
        ],
        10,
      ),
    ).toEqual([]);
  });
});

describe("spiderLayout (S25.5)", () => {
  const box = { x: 0, y: 0, w: 1000, h: 800 };
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  it("puts n spots on one ring about the mean, a touch target apart, inside the box", () => {
    const at = spiderLayout(
      [
        [500, 400],
        [504, 400],
        [500, 403],
      ],
      2,
      box,
    );
    expect(at).toHaveLength(3);
    const c = [(500 + 504 + 500) / 3, (400 + 400 + 403) / 3];
    const r = dist(at[0], c);
    for (const p of at) expect(dist(p, c)).toBeCloseTo(r, 6);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(dist(at[i], at[j])).toBeGreaterThanOrEqual(SPIDER_GAP_PX * 2 - 1e-6);
    for (const p of at) {
      expect(p[0]).toBeGreaterThan(0);
      expect(p[0]).toBeLessThan(1000);
      expect(p[1]).toBeGreaterThan(0);
      expect(p[1]).toBeLessThan(800);
    }
  });
  it("moves a ring that would leave the box back in, in both axes", () => {
    for (const [x, y] of [
      [3, 3],
      [997, 3],
      [3, 797],
      [997, 797],
    ]) {
      const at = spiderLayout(
        [
          [x, y],
          [x + 1, y],
        ],
        2,
        box,
      );
      for (const p of at) {
        expect(p[0]).toBeGreaterThanOrEqual(0);
        expect(p[0]).toBeLessThanOrEqual(1000);
        expect(p[1]).toBeGreaterThanOrEqual(0);
        expect(p[1]).toBeLessThanOrEqual(800);
      }
      expect(dist(at[0], at[1])).toBeGreaterThanOrEqual(SPIDER_GAP_PX * 2 - 1e-6);
    }
  });
  it("keeps the ring a fixed size on screen: the plan radius follows unit (plan units per px)", () => {
    const a = spiderLayout(
        [
          [500, 400],
          [501, 400],
        ],
        1,
        box,
      ),
      b = spiderLayout(
        [
          [500, 400],
          [501, 400],
        ],
        3,
        box,
      );
    expect(dist(b[0], b[1]) / dist(a[0], a[1])).toBeCloseTo(3, 6);
  });
  it("returns nothing for junk", () => {
    expect(spiderLayout([], 2, box)).toEqual([]);
    expect(
      spiderLayout(
        [
          [NaN, 1],
          [2, 2],
        ],
        2,
        box,
      ),
    ).toEqual([]);
    expect(
      spiderLayout(
        [
          [1, 1],
          [2, 2],
        ],
        NaN,
        box,
      ),
    ).toEqual([]);
    expect(
      spiderLayout(
        [
          [1, 1],
          [2, 2],
        ],
        0,
        box,
      ),
    ).toEqual([]);
    expect(spiderLayout(5 as never, 2, box)).toEqual([]);
  });
  it("a box too small for the ring centres it instead of throwing", () => {
    const at = spiderLayout(
      [
        [5, 5],
        [6, 5],
      ],
      2,
      { x: 0, y: 0, w: 20, h: 20 },
    );
    expect(at).toHaveLength(2);
    expect(at.flat().every(Number.isFinite)).toBe(true);
  });
});

describe("renderFloor with a spider (S25.5)", () => {
  const floor = (name = "Lamp A") =>
    ({
      outline: [],
      rooms: [],
      walls: [],
      openings: [],
      doors: [],
      stairs: [],
      extras: [],
      furniture: [],
      unlinked: [],
      devices: [
        { id: "a", type: "light", entity: "light.a", name: `${name}`, x: 100, y: 100 },
        { id: "b", type: "light", entity: "light.b", name: "Lamp B", x: 104, y: 100 },
        { id: "c", type: "light", entity: "light.c", name: "Far", x: 400, y: 400 },
      ],
    }) as never;
  const opts = { scale: 1, theme: "light" as const };
  it("draws no ring without the option, and the markup is byte for byte as before", () => {
    expect(renderFloor(floor(), opts)).not.toMatch(/spider/);
  });
  it("moves the members' icons to their spots, with a leader and a pin each and a name", () => {
    const s = renderFloor(floor(), {
      ...opts,
      spider: [
        { i: 0, at: [60, 60] },
        { i: 1, at: [160, 60] },
      ],
    });
    expect(s.match(/class="spider-leader"/g)).toHaveLength(2);
    expect(s.match(/class="spider-pin"/g)).toHaveLength(2);
    expect(s).toMatch(/<text class="spider-lbl"[^>]*>Lamp A<\/text>/);
    expect(s).toMatch(/<text class="spider-lbl"[^>]*>Lamp B<\/text>/);
    const g = (i: number) =>
      new RegExp(`<g data-x="${i}" class="dev [^"]*"[^>]*transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)`).exec(s);
    expect(g(0)![1]).not.toBe(g(2)![1]);
    expect(s).toMatch(/<g data-x="0" class="dev [^"]*spider/);
    expect(s).not.toMatch(/<g data-x="2" class="dev [^"]*spider/);
  });
  it("paints the ring last, so a later device or an appliance never covers a member", () => {
    const f = floor() as unknown as { unlinked: unknown[] };
    f.unlinked = [{ id: "u", type: "tv", x: 60, y: 60, name: "Telly" }];
    const s = renderFloor(f as never, {
      ...opts,
      spider: [
        { i: 0, at: [60, 60] },
        { i: 1, at: [160, 60] },
      ],
    });
    const at = (re: RegExp) => s.search(re);
    expect(at(/<g data-x="0"/)).toBeGreaterThan(at(/<g data-x="2"/));
    expect(at(/<g data-x="1"/)).toBeGreaterThan(at(/<g data-x="2"/));
    expect(at(/<g data-x="0"/)).toBeGreaterThan(at(/data-u="/));
    expect(at(/class="spider-leader"/)).toBeLessThan(at(/<g data-x="0"/));
  });
  it("escapes the name and drops junk entries", () => {
    const s = renderFloor(floor('"><script>x</script>'), {
      ...opts,
      spider: [
        { i: 0, at: [60, 60] },
        { i: 1, at: [NaN, 3] },
        { i: 9, at: [1, 1] },
        { i: 1.5, at: [1, 1] },
        null,
        "x",
      ] as never,
    });
    expect(s).not.toContain("<script>x");
    expect(s.match(/class="spider-leader"/g)).toHaveLength(1);
  });
  it("a hidden device is not fanned", () => {
    const f = floor() as unknown as { devices: { type: string }[] };
    const s = renderFloor(f as never, { ...opts, hiddenLayers: ["lights"], spider: [{ i: 0, at: [60, 60] }] });
    expect(s).not.toMatch(/spider-leader/);
  });
});

describe("spiderLayout with a drawn size (UI refactor, item 8)", () => {
  const box = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const spots = (n: number) => Array.from({ length: n }, (_, j) => [500 + j, 400] as [number, number]);
  for (const n of [2, 3, 5, 8])
    for (const disc of [30, 90, 240])
      it(`${n} members of a ${disc} px disc sit at least a disc apart, and the ring grows with the disc`, () => {
        const unit = 0.5; // 0.5 plan units per px
        const at = spiderLayout(spots(n), unit, box, { disc });
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) expect(dist(at[i], at[j]) / unit).toBeGreaterThanOrEqual(disc);
        const plain = spiderLayout(spots(n), unit, box);
        if (disc >= 90) expect(dist(at[0], at[1])).toBeGreaterThan(dist(plain[0], plain[1]));
      });
  it("keeps a name tag off the next member's disc", () => {
    const n = 6,
      disc = 90,
      tag = 110;
    const at = spiderLayout(spots(n), 1, box, { disc, tag, font: 12 });
    const cx = at.reduce((s, p) => s + p[0], 0) / n;
    at.forEach((p, i) => {
      const right = p[0] >= cx - 1e-6,
        x0 = p[0] + (right ? 1 : -1) * 0.625 * disc,
        lo = Math.min(x0, x0 + (right ? tag : -tag)),
        hi = Math.max(x0, x0 + (right ? tag : -tag));
      at.forEach((q, j) => {
        if (i === j) return;
        const nx = Math.min(hi, Math.max(lo, q[0])),
          ny = Math.min(p[1] + 7, Math.max(p[1] - 7, q[1]));
        expect(Math.hypot(nx - q[0], ny - q[1]), `tag ${i} on disc ${j}`).toBeGreaterThanOrEqual(disc / 2);
      });
    });
  });
  it("junk sizes are ignored", () => {
    for (const s of [undefined, { disc: NaN }, { disc: -4 }, { disc: "9" as never }, null as never])
      expect(spiderLayout(spots(3), 1, box, s)).toEqual(spiderLayout(spots(3), 1, box));
  });
});
