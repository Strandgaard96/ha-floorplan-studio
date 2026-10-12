import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// S29 (A3, S3): the card tells renderFloor whether to draw cover art. renderFloor is wrapped, not replaced (card-view-memory.test.ts's trick).
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

describe("media_art (S29, S3)", () => {
  it("on by default", async () => {
    await mount();
    expect(lastOpts().mediaArt).toBe(true);
  });
  it("media_art: false is off; junk is on", async () => {
    const off = await mount({ media_art: false });
    expect(lastOpts().mediaArt).toBe(false);
    off.remove();
    for (const v of ["no", 0, null, "false"]) {
      const el = await mount({ media_art: v as never });
      expect(lastOpts().mediaArt, JSON.stringify(v)).toBe(true);
      el.remove();
    }
  });
});
