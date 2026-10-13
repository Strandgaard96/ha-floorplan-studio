import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// The studio's View, Names toggle (every device's name on the plan) in the card: parity with the editor, which has
// it. Off by default, like the editor; the config key `names` sets the start; a pick is remembered and reset.

vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import { hasMenuItem, pickItem, stateOfItem } from "./menu-dom";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const showNames = () => (((renderFloor as unknown as Mock).mock.calls.at(-1)![1]) as RenderOpts).showNames;

async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
// S31.6: Device names is a checkbox item of the header menu (`names`), Reset view its action (`reset`).
const names = (el: FloorplanStudioCard) => stateOfItem(el, "names");
const toggle = (el: FloorplanStudioCard) => pickItem(el, "names");

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Device names toggle", () => {
  it("is off by default, unchecked, and the core is told", async () => {
    const el = await mount();
    expect(showNames()).toBeFalsy();
    expect(await names(el)).toBe("false");
  });

  it("config names: true starts on; anything but true is off", async () => {
    for (const [v, want] of [[true, true], [false, false], ["yes", false], [1, false]] as const) {
      const el = await mount({ names: v as never });
      expect(!!showNames(), String(v)).toBe(want);
      el.remove();
    }
  });

  it("a click turns the names on and off, and the checked state follows", async () => {
    const el = await mount();
    await toggle(el);
    expect(showNames()).toBe(true);
    expect(await names(el)).toBe("true");
    await toggle(el);
    expect(showNames()).toBe(false);
  });

  it("is remembered over a reload, and Reset view puts the config's value back", async () => {
    const el = await mount();
    await toggle(el);
    el.remove();
    const again = await mount();
    expect(showNames()).toBe(true);
    await pickItem(again, "reset");
    expect(showNames()).toBeFalsy();
    expect(Object.entries(localStorage).filter(([k]) => k.startsWith("fp-view:"))).toEqual([]);
  });

  it("a stored value that is not a boolean is dropped", async () => {
    const el = await mount();
    await toggle(el);
    const [key] = Object.keys(localStorage).filter((k) => k.startsWith("fp-view:"));
    localStorage.setItem(key!, JSON.stringify({ v: 1, names: "yes" }));
    el.remove();
    await mount();
    expect(showNames()).toBeFalsy();
  });

  it("goes with the View controls: view_switch false and kiosk drop the item", async () => {
    for (const cfg of [{ view_switch: false }, { kiosk: true }]) {
      const el = await mount(cfg);
      expect(await hasMenuItem(el, "names"), JSON.stringify(cfg)).toBe(false);
      el.remove();
    }
  });
});
