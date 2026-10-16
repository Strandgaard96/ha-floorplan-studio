import { describe, expect, it } from "vitest";
import { dashboardFor } from "../../src/card/strategy";
import "../../src/card/floorplan-studio-card"; // the bundle's entry: it is what defines the strategy element
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
  for (const [k, t] of Object.entries(titles))
    Object.defineProperty(l.floors, k, {
      value: {
        ...JSON.parse(JSON.stringify(first)),
        title: t,
        devices: [],
        doors: [],
        stairs: [],
        openings: [],
        extras: [],
        furniture: [],
        unlinked: [],
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
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
    expect(cardOf(d.views[1])).toEqual({
      type: "custom:floorplan-studio-card",
      floor: "first",
      theme: "blueprint",
      view: "2.5d",
      title: "T",
    });
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
    for (const r of [
      { error: { code: "not_loaded", message: "Floorplan Studio is not set up." } },
      new Error("boom"),
    ]) {
      const d = dashboardFor(r as any, {});
      expect(d.views).toHaveLength(1);
      expect(d.views[0].cards[0].type).toBe("markdown");
      expect(d.views[0].cards[0].content).toMatch(/integration/i);
    }
    expect(
      dashboardFor({ error: { code: "not_loaded", message: "Floorplan Studio is not set up." } } as any, {}).views[0]
        .cards[0].content,
    ).toContain("not set up");
  });

  // S33 review: the error card is a markdown card and Home Assistant renders markdown as a Jinja template, so text copied
  // from a stranger's layout must not carry a live `{{ }}` or a tag.
  it("escapes layout text copied into the error card, so no template or tag survives", () => {
    const evil = `{{ states('lock.front') }}"><script>alert(1)</script>{% x %}&amp;`;
    const bad = clone();
    bad.floors[evil] = 5;
    const text = dashboardFor({ layout: bad }, {}).views[0].cards[0].content as string;
    expect(text).toContain("The saved floor plan is not valid");
    expect(text).toContain("lock.front"); // it is still shown, as text
    expect(text).not.toMatch(/\{\{|\{%|<script|<|>/);
    expect(text).toContain("&#38;amp;"); // an entity in the source is shown as typed, not read
  });

  it("lists at most 10 errors and says how many more", () => {
    const bad = clone();
    for (const d of bad.floors.ground.devices) d.entity = "no entity";
    for (let i = 0; i < 25; i++)
      bad.floors.ground.devices.push({ id: `x${i}`, type: "light", entity: "nope", name: "n", x: 1, y: 1 });
    const text = dashboardFor({ layout: bad }, {}).views[0].cards[0].content as string;
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(10);
    expect(text).toMatch(/\.\.\. and \d+ more/);
  });

  it("says why when the layout is invalid, and lists the errors", () => {
    const bad = clone();
    bad.version = 7;
    const d = dashboardFor({ layout: bad }, {});
    expect(d.views).toHaveLength(1);
    expect(d.views[0].cards[0].type).toBe("markdown");
    expect(d.views[0].cards[0].content).toMatch(/version/);
    expect(dashboardFor({ layout: 5 } as any, {}).views[0].cards[0].type).toBe("markdown");
    expect(dashboardFor({ layout: { version: 2, floors: 5 } } as any, {}).views[0].cards[0].type).toBe("markdown");
  });

  it("ignores junk config and never throws", () => {
    const layout = withFloors({ ground: "Ground" });
    for (const cfg of [
      null,
      undefined,
      5,
      "x",
      [],
      { card: 5 },
      { card: [1] },
      { card: null },
      { title: 5 },
      { title: "" },
      { card: { theme: () => 1 } },
    ]) {
      const d = dashboardFor({ layout }, cfg as any);
      expect(d.title).toBe("Floorplan");
      expect(d.views).toHaveLength(1);
      expect(cardOf(d.views[0]).floor).toBe("ground");
    }
    expect(() => dashboardFor(Symbol("x") as any, Symbol("y") as any)).not.toThrow();
  });
});

// S33.10, spec X4. Home Assistant builds a dashboard from `strategy: { type: custom:floorplan-studio }` by calling
// `static async generate(config, hass)` on the element `ll-strategy-dashboard-floorplan-studio`. The load reply `{ layout }`
// is copied from custom_components/floorplan_studio/websocket.py (`ws_load`: `connection.send_result(msg["id"], {"layout": ...})`);
// a failed command rejects with `{ code, message }` (HA's websocket error shape).
describe("the strategy element", () => {
  const NAME = "ll-strategy-dashboard-floorplan-studio";
  type Strategy = { generate(config: unknown, hass: unknown): Promise<any> };
  const element = () => customElements.get(NAME) as unknown as Strategy;
  const hassWith = (reply: () => Promise<unknown>) => {
    const sent: unknown[] = [];
    return {
      sent,
      hass: {
        connection: {
          sendMessagePromise: (m: unknown) => {
            sent.push(m);
            return reply();
          },
        },
      },
    };
  };

  it("is defined once the card's bundle has loaded", () => {
    expect(element()).toBeTypeOf("function");
    expect(element().generate).toBeTypeOf("function");
  });

  it("asks for the layout with floorplan_studio/load and returns the dashboard of three floors", async () => {
    const layout = withFloors({ ground: "Ground", first: "First", attic: "Attic" });
    const { hass, sent } = hassWith(async () => ({ layout }));
    const d = await element().generate(
      { type: "custom:floorplan-studio", title: "House", card: { theme: "slate", floor: "nope" } },
      hass,
    );
    expect(sent).toEqual([{ type: "floorplan_studio/load" }]);
    expect(d.title).toBe("House");
    expect(d.views.map((v: any) => v.title)).toEqual(["Ground", "First", "Attic"]);
    expect(d.views.map((v: any) => cardOf(v))).toEqual([
      { type: "custom:floorplan-studio-card", floor: "ground", theme: "slate" },
      { type: "custom:floorplan-studio-card", floor: "first", theme: "slate" },
      { type: "custom:floorplan-studio-card", floor: "attic", theme: "slate" },
    ]);
  });

  it("returns the one view that says why when the load is rejected, and does not throw", async () => {
    const { hass } = hassWith(() => Promise.reject({ code: "not_loaded", message: "Floorplan Studio is not set up." }));
    const d = await element().generate({}, hass);
    expect(d.views).toHaveLength(1);
    expect(d.views[0].cards[0].type).toBe("markdown");
    expect(d.views[0].cards[0].content).toContain("Floorplan Studio is not set up.");
  });

  it("returns the one view for no layout saved yet, and for no hass or no connection", async () => {
    const none = await element().generate({}, hassWith(async () => ({ layout: null })).hass);
    expect(none.views[0].cards[0].content).toContain("no floor plan yet");
    for (const h of [undefined, null, {}, { connection: {} }, { connection: { sendMessagePromise: 5 } }]) {
      const d = await element().generate({}, h);
      expect(d.views).toHaveLength(1);
      expect(d.views[0].cards[0].type).toBe("markdown");
    }
  });

  it("a connection that throws on call is the error view too", async () => {
    const d = await element().generate(
      {},
      {
        connection: {
          sendMessagePromise: () => {
            throw new Error("socket closed");
          },
        },
      },
    );
    expect(d.views[0].cards[0].content).toContain("socket closed");
  });
});
