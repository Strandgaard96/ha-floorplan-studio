import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// S29 (S3, H2): the card hands renderFloor the comfort scale from its YAML. renderFloor is wrapped, not replaced (card-view-memory.test.ts's trick).
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const lastOpts = () => (renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts;
async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks(); // spies first, then the clock (finding 15)
  vi.useRealTimers();
  localStorage.clear();
});

describe("temp_colors, heat_min, heat_max (S29)", () => {
  it("on by default, at 17 and 25", async () => {
    await mount();
    expect(lastOpts().tempColors).toEqual([17, 25]);
  });
  it("the YAML bounds are used when they are a range", async () => {
    await mount({ heat_min: 16, heat_max: 26 });
    expect(lastOpts().tempColors).toEqual([16, 26]);
  });
  it("bad bounds are 17 and 25", async () => {
    for (const [a, b] of [
      [26, 16],
      ["16", 26],
      [NaN, 26],
    ] as const) {
      const el = await mount({ heat_min: a as never, heat_max: b as never });
      expect(lastOpts().tempColors, JSON.stringify([a, b])).toEqual([17, 25]);
      el.remove();
    }
  });
  it("temp_colors: false is off; junk is on", async () => {
    const off = await mount({ temp_colors: false });
    expect(lastOpts().tempColors).toBeUndefined();
    off.remove();
    for (const v of ["no", 0, null, "false"]) {
      const el = await mount({ temp_colors: v as never });
      expect(lastOpts().tempColors, JSON.stringify(v)).toEqual([17, 25]);
      el.remove();
    }
  });
});
