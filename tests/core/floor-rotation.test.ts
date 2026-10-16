import { describe, it, expect } from "vitest";
import demo from "../../demo/layout.json";
import { migrate } from "../../src/core/migrate";
import { validate } from "../../src/core/schema";

const plain = () => structuredClone(demo) as any;
const errorsOf = (l: any) => {
  const r = validate(l);
  return r.ok ? [] : r.errors;
};
const withRot = (v: unknown, key = "ground") => {
  const l = plain();
  l.floors[key].rotation = v;
  return l;
};

const GOOD: [string, unknown][] = [
  ["0", 0],
  ["-180", -180],
  ["180", 180],
  ["3.25", 3.25],
  ["-0.01", -0.01],
];
const BAD: [string, unknown][] = [
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["-Infinity", -Infinity],
  ["text", "3"],
  ["null", null],
  ["181", 181],
  ["-180.5", -180.5],
  ["a list", [4]],
  ["an object", { v: 4 }],
  ["true", true],
];

describe("Floor.rotation (S29.1)", () => {
  it("absent is valid and stays absent through migrate", () => {
    expect(errorsOf(plain())).toEqual([]);
    expect("rotation" in migrate(plain()).floors.ground).toBe(false);
  });
  for (const [label, v] of GOOD) {
    it(`validate accepts ${label}; migrate keeps it as written`, () => {
      expect(errorsOf(withRot(v))).toEqual([]);
      expect(migrate(withRot(v)).floors.ground.rotation).toBe(v);
    });
  }
  for (const [label, v] of BAD) {
    it(`validate reports ${label} and does not throw`, () => {
      expect(errorsOf(withRot(v)).some((e) => /rotation/.test(e))).toBe(true);
    });
    it(`migrate drops ${label}; the result opens and validates`, () => {
      const m = migrate(withRot(v));
      expect("rotation" in m.floors.ground).toBe(false);
      expect(validate(m).ok).toBe(true);
    });
  }
  it("migrate does not change its input", () => {
    const l = withRot("3");
    migrate(l);
    expect(l.floors.ground.rotation).toBe("3");
  });
  it("migrate keeps a good rotation and drops a bad one on different floors of one layout", () => {
    const l = plain();
    const [a, b] = Object.keys(l.floors);
    l.floors[a].rotation = 3.25;
    l.floors[b].rotation = 181;
    const m = migrate(l);
    expect(m.floors[a].rotation).toBe(3.25);
    expect("rotation" in m.floors[b]).toBe(false);
  });
  it("works on a floor whose key is __proto__", () => {
    const f = plain().floors.ground;
    const mk = (rot: unknown) => {
      const l = plain();
      l.floors = JSON.parse(`{"__proto__": ${JSON.stringify({ ...f, rotation: rot })}}`);
      return l;
    };
    expect(errorsOf(mk(3.25))).toEqual([]);
    expect(Object.getOwnPropertyDescriptor(migrate(mk(3.25)).floors, "__proto__")?.value.rotation).toBe(3.25);
    const bad = JSON.parse(JSON.stringify(mk(1)).replace(/"rotation":1/, `"rotation":"x"`));
    expect(errorsOf(bad).some((e) => /rotation/.test(e))).toBe(true);
    expect("rotation" in Object.getOwnPropertyDescriptor(migrate(bad).floors, "__proto__")!.value).toBe(false);
  });
});
