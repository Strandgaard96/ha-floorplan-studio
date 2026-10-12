import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// S29 (A6, Review focus 5): failed cover art. renderFloor is wrapped to read the options it gets. renderFloor is wrapped, not replaced (card-view-memory.test.ts's trick).
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const lastOpts = () => (renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts;
beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks(); // spies first, then the clock (finding 15)
  vi.useRealTimers();
  localStorage.clear();
});
const L = demo as unknown as Layout;
const layout = () => {
  const l = structuredClone(L);
  l.floors.ground.devices.push({
    id: "spk",
    type: "speaker",
    entity: "media_player.kitchen",
    name: "Kitchen speaker",
    x: 700,
    y: 300,
  } as never);
  return l;
};
const hassWith = (href: string) => ({
  states: {
    "media_player.kitchen": {
      state: "playing",
      attributes: { entity_picture_local: href },
      last_changed: "2026-10-12T10:00:00Z",
    },
  },
  callService: () => undefined,
});
async function mount(href: string) {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: layout(), floor: "ground" } as FloorplanStudioCardConfig);
  el.hass = hassWith(href) as never;
  await el.updateComplete;
  return el;
}
const fail = async (el: FloorplanStudioCard) => {
  const img = el.shadowRoot!.querySelector("svg image.art");
  expect(img, "an image to fail").not.toBeNull();
  img!.dispatchEvent(new Event("error")); // does not bubble: only a capturing listener above it sees it
  await el.updateComplete;
};

describe("failed cover art (S29, A6, Review focus 5)", () => {
  it("an image that fails is drawn as the glyph after one render", async () => {
    const el = await mount("/api/a.png?cache=1");
    const calls = (renderFloor as unknown as Mock).mock.calls.length;
    await fail(el);
    expect(lastOpts().artFailed?.has("/api/a.png?cache=1")).toBe(true);
    expect(el.shadowRoot!.querySelector("svg image.art")).toBeNull();
    await el.updateComplete;
    expect((renderFloor as unknown as Mock).mock.calls.length - calls).toBe(1); // one render, no loop
  });
  it("the set holds 64, drops the oldest, and a dropped href is tried again", async () => {
    const el = await mount("/api/x.png?n=0");
    for (let n = 0; n < 70; n++) {
      el.hass = hassWith(`/api/x.png?n=${n}`) as never;
      await el.updateComplete;
      await fail(el);
    }
    const set = lastOpts().artFailed!;
    expect(set.size).toBe(64);
    expect(set.has("/api/x.png?n=0")).toBe(false);
    expect(set.has("/api/x.png?n=69")).toBe(true);
    el.hass = hassWith("/api/x.png?n=0") as never;
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector("svg image.art")?.getAttribute("href")).toBe("/api/x.png?n=0");
  }, 20_000); // 70 full card renders: past the 5 s default when the whole suite runs at once
  it("an error from anything else (another image, a script) is ignored", async () => {
    const el = await mount("/api/b.png");
    const other = document.createElementNS("http://www.w3.org/2000/svg", "image");
    el.shadowRoot!.querySelector("svg")!.appendChild(other);
    other.dispatchEvent(new Event("error"));
    await el.updateComplete;
    expect(lastOpts().artFailed?.size ?? 0).toBe(0);
  });
});
