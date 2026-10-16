import { describe, expect, it } from "vitest";
import { holdActionOf, tapActionOf } from "../../src/card/tap-action";

// S33.3, spec X2. The card's `tap_action` and `hold_action` are untrusted YAML (finding 1). Each reader returns the
// action to run and `warn`, true when the key was present but not usable, so the card warns once. Absent is the
// default and is not a warning.

const TAP = ["popup", "more-info", "toggle", "none"] as const;
const HOLD = ["more-info", "none"] as const;
// Home Assistant's other actions: they mean one target per card, which a plan of 400 devices is not.
const UNSUPPORTED = [
  "navigate",
  "url",
  "perform-action",
  "call-service",
  "assist",
  "fire-dom-event",
  "foo",
  "",
  "__proto__",
];

describe("tapActionOf", () => {
  it("reads every supported action as an object", () => {
    for (const a of TAP) expect(tapActionOf({ action: a })).toEqual({ action: a, warn: false });
  });
  it("reads a string as the action", () => {
    for (const a of TAP) expect(tapActionOf(a)).toEqual({ action: a, warn: false });
    expect(tapActionOf("toggle").action).toBe("toggle");
  });
  it("treats absent as popup, without a warning", () => {
    expect(tapActionOf(undefined)).toEqual({ action: "popup", warn: false });
    expect(tapActionOf(null)).toEqual({ action: "popup", warn: false });
  });
  it("treats an unsupported action as popup and warns", () => {
    for (const a of UNSUPPORTED) {
      expect(tapActionOf({ action: a })).toEqual({ action: "popup", warn: true });
      expect(tapActionOf(a)).toEqual({ action: "popup", warn: true });
    }
  });
  it("treats junk as popup and warns, never throws", () => {
    const junk: unknown[] = [
      5,
      NaN,
      true,
      [],
      ["toggle"],
      [{ action: "toggle" }],
      {},
      { action: 5 },
      { action: null },
      { action: ["toggle"] },
      { action: {} },
      JSON.parse('{"__proto__":{"action":"toggle"}}'),
      () => "toggle",
      Symbol("x"),
      { toString: () => "toggle" },
    ];
    for (const j of junk) expect(tapActionOf(j)).toEqual({ action: "popup", warn: true });
  });
  it("survives a getter that throws and a proxy that throws", () => {
    const getter = {
      get action(): string {
        throw new Error("boom");
      },
    };
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
        getPrototypeOf() {
          throw new Error("boom");
        },
      },
    );
    expect(tapActionOf(getter)).toEqual({ action: "popup", warn: true });
    expect(tapActionOf(proxy)).toEqual({ action: "popup", warn: true });
  });
  it("is case and space exact: 'Toggle' is not toggle", () => {
    expect(tapActionOf("Toggle")).toEqual({ action: "popup", warn: true });
    expect(tapActionOf(" toggle")).toEqual({ action: "popup", warn: true });
  });
});

describe("holdActionOf", () => {
  it("reads every supported action, as object and as string", () => {
    for (const a of HOLD) {
      expect(holdActionOf({ action: a })).toEqual({ action: a, warn: false });
      expect(holdActionOf(a)).toEqual({ action: a, warn: false });
    }
  });
  it("treats absent as more-info, without a warning", () => {
    expect(holdActionOf(undefined)).toEqual({ action: "more-info", warn: false });
    expect(holdActionOf(null)).toEqual({ action: "more-info", warn: false });
  });
  it("does not take popup or toggle as a hold, and warns", () => {
    for (const a of ["popup", "toggle", ...UNSUPPORTED]) {
      expect(holdActionOf({ action: a })).toEqual({ action: "more-info", warn: true });
      expect(holdActionOf(a)).toEqual({ action: "more-info", warn: true });
    }
  });
  it("treats junk as more-info and warns, never throws", () => {
    const junk: unknown[] = [
      5,
      NaN,
      [],
      ["none"],
      {},
      { action: 5 },
      JSON.parse('{"__proto__":{"action":"none"}}'),
      {
        get action(): string {
          throw new Error("boom");
        },
      },
    ];
    for (const j of junk) expect(holdActionOf(j)).toEqual({ action: "more-info", warn: true });
  });
});
