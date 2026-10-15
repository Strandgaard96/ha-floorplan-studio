import { describe, expect, it } from "vitest";
import { dashboardFor } from "../../src/card/strategy";
import demo from "../../demo/layout.json";

// S33.9. The shape of a load reply is copied from custom_components/floorplan_studio/websocket.py: `{ layout }`,
// with `layout` null when nothing was saved. A failed load reaches dashboardFor as `{ error }` (the element catches
// the rejection) or as an Error.

const clone = () => JSON.parse(JSON.stringify(demo));
const withFloors = (titles: Record<string, string>) => {
  const l = clone();
  const first = l.floors[Object.keys(l.floors)[0]];
  l.floors = {};
  // Ids must be unique across floors, so a copy carries the plan only, no devices.
  for (const [k, t] of Object.entries(titles)) Object.defineProperty(l.floors, k, { value: { ...JSON.parse(JSON.stringify(first)), title: t, devices: [], doors: [], stairs: [], openings: [], extras: [], furniture: [], unlinked: [] }, enumerable: true, configurable: true, writable: true });
  l.catalog = [];
  return l;
};
const cardOf = (v: any) => v.cards[0];

describe("dashboardFor", () => {
  it("builds one panel view per floor, in the layout's order, each card pinned to its floor", () => {
    const d = dashboardFor({ layout: withFloors({ ground: "Ground", first: "First", attic: "Attic" }) }, {});
    expect(d.title).toBe("Floorplan");
    expect(d.views.map((v: any) => v.title)).toEqual(["Ground", "First", "Attic"]);
    expect(d.views.map((v: any) => v.path)).toEqual(["ground", "first", "attic"]);
    expect(d.views.every((v: any) => v.panel === true)).toBe(true);
    expect(d.views.map((v: any) => cardOf(v))).toEqual([
      { type: "custom:floorplan-studio-card", floor: "ground" },
      { type: "custom:floorplan-studio-card", floor: "first" },
      { type: "custom:floorplan-studio-card", floor: "attic" },
    ]);
  });

  it("slugs the key for the path, and keeps paths unique", () => {
    const d = dashboardFor({ layout: withFloors({ "Top Floor!": "A", "top-floor": "B", "***": "C" }) }, {});
    expect(d.views.map((v: any) => v.path)).toEqual(["top-floor", "top-floor-2", "floor"]);
    expect(d.views.map((v: any) => cardOf(v).floor)).toEqual(["Top Floor!", "top-floor", "***"]);
  });

  it("merges config.card into every card and never over type or floor", () => {
    const d = dashboardFor(
      { layout: withFloors({ ground: "Ground", first: "First" }) },
      { card: { theme: "blueprint", view: "2.5d", type: "evil", floor: "nope", title: "T" }, title: "My house" },
    );
    expect(d.title).toBe("My house");
    expect(cardOf(d.views[1])).toEqual({ type: "custom:floorplan-studio-card", floor: "first", theme: "blueprint", view: "2.5d", title: "T" });
    expect(cardOf(d.views[0]).floor).toBe("ground");
  });

  it("keeps a floor named __proto__ as data, and does not pollute", () => {
    const layout = withFloors({ ground: "Ground", ["__proto__"]: "Proto" });
    const d = dashboardFor({ layout }, { card: JSON.parse('{"__proto__":{"polluted":1},"theme":"dark"}') });
    expect(d.views.map((v: any) => cardOf(v).floor)).toContain("__proto__");
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(cardOf(d.views[0]))).toBe(Object.prototype);
    expect(cardOf(d.views[0]).theme).toBe("dark");
    expect(d.views.every((v: any) => /^[a-z0-9-]+$/.test(v.path))).toBe(true);
  });

  it("passes a hostile title through as data, never as HTML", () => {
    const d = dashboardFor({ layout: withFloors({ ground: '"><script>alert(1)</script>' }) }, { title: '"><script>' });
    expect(d.views[0].title).toBe('"><script>alert(1)</script>');
    expect(d.title).toBe('"><script>');
    expect(d.views[0].path).toMatch(/^[a-z0-9-]+$/);
    expect(cardOf(d.views[0]).type).toBe("custom:floorplan-studio-card");
  });

  it("says why when there is no layout", () => {
    for (const r of [{ layout: null }, {}, null, undefined]) {
      const d = dashboardFor(r as any, {});
      expect(d.views).toHaveLength(1);
      expect(d.views[0].cards[0].type).toBe("markdown");
      expect(d.views[0].cards[0].content).toMatch(/Studio/);
      expect(d.views[0].cards[0].content).toMatch(/save/i);
    }
  });

  it("says why when the load failed", () => {
    for (const r of [{ error: { code: "not_loaded", message: "Floorplan Studio is not set up." } }, new Error("boom")]) {
      const d = dashboardFor(r as any, {});
      expect(d.views).toHaveLength(1);
      expect(d.views[0].cards[0].type).toBe("markdown");
      expect(d.views[0].cards[0].content).toMatch(/integration/i);
    }
    expect(dashboardFor({ error: { code: "not_loaded", message: "Floorplan Studio is not set up." } } as any, {}).views[0].cards[0].content).toContain("not set up");
  });

  it("says why when the layout is invalid, and lists the errors", () => {
    const bad = clone(); bad.version = 7;
    const d = dashboardFor({ layout: bad }, {});
    expect(d.views).toHaveLength(1);
    expect(d.views[0].cards[0].type).toBe("markdown");
    expect(d.views[0].cards[0].content).toMatch(/version/);
    expect(dashboardFor({ layout: 5 } as any, {}).views[0].cards[0].type).toBe("markdown");
    expect(dashboardFor({ layout: { version: 2, floors: 5 } } as any, {}).views[0].cards[0].type).toBe("markdown");
  });

  it("ignores junk config and never throws", () => {
    const layout = withFloors({ ground: "Ground" });
    for (const cfg of [null, undefined, 5, "x", [], { card: 5 }, { card: [1] }, { card: null }, { title: 5 }, { title: "" }, { card: { theme: () => 1 } }]) {
      const d = dashboardFor({ layout }, cfg as any);
      expect(d.title).toBe("Floorplan");
      expect(d.views).toHaveLength(1);
      expect(cardOf(d.views[0]).floor).toBe("ground");
    }
    expect(() => dashboardFor(Symbol("x") as any, Symbol("y") as any)).not.toThrow();
  });
});
