import { describe, expect, it } from "vitest";
import { inkFor, parseRgb } from "../../src/card/three/overlay";

describe("idle ink on the disc (UI refactor item 9)", () => {
  it("reads the colour forms a browser computes", () => {
    expect(parseRgb("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseRgb("rgba(1, 2, 3, 0.5)")).toEqual([1, 2, 3]);
    expect(parseRgb("color(srgb 1 0 0.5)")).toEqual([255, 0, 127.5]);
    expect(parseRgb("nonsense")).toBeNull();
  });
  it("keeps an idle colour that is already 3.3:1 on the disc", () => {
    expect(inkFor([139, 133, 120], [255, 255, 255])).toBeNull(); // 3.67
    expect(inkFor([139, 133, 120], [28, 28, 28])).toBeNull();
  });
  it("darkens it on a light disc and lightens it on a dark one until it passes", () => {
    const dark = inkFor([136, 143, 153], [238, 243, 251])!;
    expect(dark[0]).toBeLessThan(136);
    const light = inkFor([90, 90, 90], [20, 20, 20])!;
    expect(light[0]).toBeGreaterThan(90);
  });
});
