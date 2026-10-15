import { describe, it, expect } from "vitest";
import demo from "../../demo/layout.json";
import { DEVICE_TYPES, validate, type Layout } from "../../src/core/schema";
import { typeForEntity, entitiesForType, AREA_PLACEABLE_TYPES } from "../../src/core/ha";
import { DEVICE_ICONS, DEVICE_TYPE_LABELS } from "../../src/core/icons";
import { NO_TOGGLE } from "../../src/card/actions";
import { ROOM_ROW_TAP } from "../../src/core/room-info";
import { FLOOR_OFF_GROUP, OFF_GROUPS, OFF_GROUP_LABEL } from "../../src/core/floor-off";
import { ACTIVE_LIST_RULE, colorVarFor } from "../../src/core/active";
import { ATTENTION_RULE } from "../../src/core/attention";
import { CATEGORY_OF } from "../../src/core/categories";
import { DEVICE_SOLID } from "../../src/core/solids";
import { DEVICE_COLOURS, FLOORPLAN_CSS, THEMES } from "../../src/core/render";

// S33.1, spec extras-s33.md X1: fan is a device type, and every per-type table says what it does (findings 17, 20).
const ent = (id: string, domain: string, dc?: string) => ({ id, name: id, domain, dc });

describe("fan is a device type", () => {
  it("is in DEVICE_TYPES right after alarm", () => {
    expect(DEVICE_TYPES).toContain("fan");
    expect(DEVICE_TYPES[DEVICE_TYPES.indexOf("alarm") + 1]).toBe("fan");
  });

  it("a fan.* entity is typed fan, and fan's own rule offers the fan domain", () => {
    expect(typeForEntity(ent("fan.bedroom", "fan"))).toBe("fan");
    const ha = { entities: [ent("fan.a", "fan"), ent("light.a", "light")] } as never;
    expect(entitiesForType(ha, "fan").match.map((e) => e.id)).toEqual(["fan.a"]);
  });

  it("validate takes a fan device, and rejects a made-up type beside it", () => {
    const l = JSON.parse(JSON.stringify(demo)) as Layout;
    const f = Object.values(l.floors)[0]!;
    f.devices.push({ id: "fan-x", type: "fan", entity: "fan.x", x: 10, y: 10 } as never);
    expect(validate(l).ok).toBe(true);
    f.devices[f.devices.length - 1]!.type = "fanx" as never;
    expect(validate(l).ok).toBe(false);
  });

  it("the demo has one fan", () => {
    const n = Object.values((demo as unknown as Layout).floors).flatMap((f) => f.devices).filter((d) => d.type === "fan").length;
    expect(n).toBe(1);
  });

  it("has its own icon path, label and colour", () => {
    expect(DEVICE_ICONS.fan).toMatch(/^M/);
    expect(DEVICE_TYPE_LABELS.fan).toBe("Fan");
    for (const t of DEVICE_TYPES) if (t !== "fan") expect(DEVICE_ICONS[t], t).not.toBe(DEVICE_ICONS.fan);
    expect(DEVICE_COLOURS.fan).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEVICE_COLOURS.fan).not.toBe(DEVICE_COLOURS.vacuum);
  });

  it("a person can switch a fan: not in NO_TOGGLE, a row tap toggles", () => {
    expect(NO_TOGGLE.has("fan")).toBe(false);
    expect(ROOM_ROW_TAP.fan).toBe("toggle");
  });

  it("All off reaches a fan: group fans, labelled Fans, after plugs", () => {
    expect(FLOOR_OFF_GROUP.fan).toBe("fans");
    expect(OFF_GROUPS).toEqual(["lights", "switches", "plugs", "fans", "media"]);
    expect(OFF_GROUP_LABEL.fans).toBe("Fans");
  });

  it("is listed when on, never an attention item, in the climate category, no solid", () => {
    expect(ACTIVE_LIST_RULE.fan).toBe("on");
    expect(ATTENTION_RULE.fan).toBe("none");
    expect(CATEGORY_OF.fan).toBe("climate");
    expect(DEVICE_SOLID.fan).toBe("none");
  });

  it("is offered from an area menu and takes its own colour variable when on", () => {
    expect(AREA_PLACEABLE_TYPES.has("fan")).toBe(true);
    const d = { id: "f", type: "fan", entity: "fan.x", x: 1, y: 1 } as never;
    expect(colorVarFor(d, { "fan.x": { state: "on", attributes: {}, last_changed: "2026-10-15T10:00:00Z" } })).toBe("--fp-dev-fan");
  });

  it("--fp-dev-fan is set in every theme, and differs from the idle grey", () => {
    for (const t of THEMES) {
      const blocks = [...FLOORPLAN_CSS.matchAll(new RegExp(`\\[data-theme="${t}"\\]\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(";");
      const v = /--fp-dev-fan:([^;]+)/.exec(blocks)?.[1]?.trim();
      expect(v, t).toBeTruthy();
      expect(v, t).not.toBe(/--fp-idle:([^;]+)/.exec(blocks)?.[1]?.trim());
    }
    expect(FLOORPLAN_CSS).toContain(".dev-fan.on{--fp-dev:var(--fp-dev-fan)}");
  });
});
