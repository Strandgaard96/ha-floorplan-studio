import { describe, it, expect } from "vitest";
import demo from "../../demo/layout.json";
import { migrate } from "../../src/core/migrate";
import { validate, MAX_VIEWS, MAX_VIEW_ZOOM } from "../../src/core/schema";
import { MAX_ZOOM } from "../../src/card/viewport";

const floorKey = () => Object.keys((demo as any).floors)[0];
const good = (over: any = {}) => ({ id: "v1", name: "Evening", floor: floorKey(), ...over });
const withViews = (views: unknown) => ({ ...structuredClone(demo), views }) as any;
const ok = (l: any) => validate(l).ok;
const errorsOf = (l: any) => {
  const r = validate(l);
  return r.ok ? [] : r.errors;
};

describe("S33.6 Layout.views: validate (spec X3, criterion 8)", () => {
  it("keeps the zoom bound the card uses", () => {
    expect(MAX_VIEW_ZOOM).toBe(MAX_ZOOM);
    expect(MAX_VIEWS).toBe(24);
  });
  it("accepts no views, an empty list, and every field set", () => {
    expect(ok(structuredClone(demo))).toBe(true);
    expect(ok(withViews([]))).toBe(true);
    expect(
      ok(
        withViews([
          good({ mode: "3d", rotation: 315, zoom: 8, center: [10, -20] }),
          good({ id: "v2", mode: "2d", rotation: 0 }),
          good({ id: "v3", mode: "2.5d", zoom: 1, center: [0, 0] }),
        ]),
      ),
    ).toBe(true);
  });
  const bad: [string, any][] = [
    ["views not an array", "nope"],
    ["views an object", { a: 1 }],
    ["25 views", Array.from({ length: 25 }, (_, i) => good({ id: `v${i}` }))],
    ["a duplicate id", [good(), good()]],
    ["an entry that is not an object", [5]],
    ["a null entry", [null]],
    ["an empty id", [good({ id: "" })]],
    ["an id of 65 characters", [good({ id: "x".repeat(65) })]],
    ["a numeric id", [good({ id: 4 })]],
    ["an empty name", [good({ name: "" })]],
    ["a name of 61 characters", [good({ name: "n".repeat(61) })]],
    ["a missing floor", [good({ floor: "attic" })]],
    ["a floor named __proto__", [good({ floor: "__proto__" })]],
    ["a floor named constructor", [good({ floor: "constructor" })]],
    ["zoom without center", [good({ zoom: 2 })]],
    ["center without zoom", [good({ center: [1, 2] })]],
    ["NaN zoom", [good({ zoom: NaN, center: [0, 0] })]],
    ["zoom 0.5", [good({ zoom: 0.5, center: [0, 0] })]],
    ["zoom past the maximum", [good({ zoom: 8.1, center: [0, 0] })]],
    ["NaN centre", [good({ zoom: 2, center: [NaN, 0] })]],
    ["a centre of three numbers", [good({ zoom: 2, center: [1, 2, 3] })]],
    ["a centre past COORD_LIMIT", [good({ zoom: 2, center: [1e7 + 1, 0] })]],
    ["a rotation of 30", [good({ rotation: 30 })]],
    ["a rotation of 360", [good({ rotation: 360 })]],
    ["a rotation of -45", [good({ rotation: -45 })]],
    ["a fractional rotation", [good({ rotation: 45.5 })]],
    ["a mode of 4d", [good({ mode: "4d" })]],
    ["an id of 2d (the card's View mode value)", [good({ id: "2d" })]],
    ["an id of 2.5d", [good({ id: "2.5d" })]],
    ["an id of 3d", [good({ id: "3d" })]],
  ];
  for (const [label, v] of bad)
    it(`rejects ${label} without throwing`, () => {
      const l = withViews(v);
      expect(() => validate(l)).not.toThrow();
      expect(ok(l)).toBe(false);
    });
  it("accepts a view named with markup: it is data, escaped where drawn", () => {
    expect(ok(withViews([good({ name: '"><script>' })]))).toBe(true);
  });
  it("names the view that failed", () => {
    expect(errorsOf(withViews([good(), good({ id: "v2", rotation: 30 })])).join("\n")).toContain("views[1]");
  });
  it("never throws on junk at the top", () => {
    for (const v of [undefined, null, 0, true, [[]], [{}], [{ id: {} }]])
      expect(() => validate(withViews(v))).not.toThrow();
  });
});

describe("S33.6 Layout.views: migrate", () => {
  it("passes good views through and they validate (a saved layout reloads with its views)", () => {
    const views = [good({ mode: "2.5d", rotation: 90, zoom: 2.5, center: [5, 6] }), good({ id: "v2", name: "Night" })];
    const m = migrate(withViews(views));
    expect(m.views).toEqual(views);
    const again = migrate(JSON.parse(JSON.stringify(m)));
    expect(again.views).toEqual(views);
    expect(ok(again)).toBe(true);
  });
  it("leaves views out when the file has none", () => {
    expect("views" in migrate(structuredClone(demo) as any)).toBe(false);
  });
  it("drops a views that is not an array, and the plan still opens", () => {
    for (const v of ["nope", 5, { a: 1 }, null]) {
      const m = migrate(withViews(v));
      expect("views" in m).toBe(false);
      expect(ok(m)).toBe(true);
    }
  });
  it("drops each bad entry, keeps the good ones in order", () => {
    const keep1 = good({ id: "a" }),
      keep2 = good({ id: "b", rotation: 45 });
    const m = migrate(
      withViews([
        keep1,
        5,
        null,
        good({ id: "c", rotation: 30 }),
        good({ id: "d", floor: "__proto__" }),
        good({ id: "e", zoom: 2 }),
        keep2,
        good({ id: "a" }),
      ]),
    );
    expect(m.views).toEqual([keep1, keep2]);
    expect(ok(m)).toBe(true);
  });
  it("drops a view whose id is a view mode, keeps its neighbours (S33 review: the card hides it, the Studio would list it)", () => {
    const keep = good({ id: "view-a" });
    for (const id of ["2d", "2.5d", "3d"]) {
      const m = migrate(withViews([good({ id }), keep]));
      expect(m.views, id).toEqual([keep]);
      expect(ok(m)).toBe(true);
    }
    expect(migrate(withViews([good({ id: "2D" })])).views).toHaveLength(1); // only the three exact values are reserved
  });
  it("keeps the first 24 of more than 24", () => {
    const m = migrate(withViews(Array.from({ length: 30 }, (_, i) => good({ id: `v${i}` }))));
    expect(m.views!.length).toBe(24);
    expect(m.views![23].id).toBe("v23");
    expect(ok(m)).toBe(true);
  });
  it("drops a view whose floor is not in the file", () => {
    expect(migrate(withViews([good({ floor: "attic" })])).views).toEqual([]);
  });
  it("does not change its input", () => {
    const l = withViews([good({ rotation: 30 })]);
    const before = JSON.stringify(l);
    migrate(l);
    expect(JSON.stringify(l)).toBe(before);
  });
});
