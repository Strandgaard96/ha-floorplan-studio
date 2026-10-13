import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// Same wrapper as card-view.test.ts: real markup, and the test reads what the card handed to core.
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import { hasMenuItem, menuOf, openMenu, pickItem, stateOfItem } from "./menu-dom";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const last = () => (renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts;

async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
// S31.6: the Tilt slider became five radio steps of the header menu, `tilt:0`, `tilt:0.25`, `tilt:0.5`, `tilt:0.75`, `tilt:1`.
const STEPS = ["0", "0.25", "0.5", "0.75", "1"];
const hasTilt = (el: FloorplanStudioCard) => hasMenuItem(el, "tilt:0.5");
/** The step that is checked in the menu, as a number; null when none is (there is no Tilt). */
const step = async (el: FloorplanStudioCard) => {
  for (const v of STEPS) if ((await stateOfItem(el, `tilt:${v}`)) === "true") return Number(v);
  return null;
};
const drag = (el: FloorplanStudioCard, value: string) => pickItem(el, `tilt:${value}`);
const box = (el: FloorplanStudioCard) => el.shadowRoot!.querySelector("svg")!.getAttribute("viewBox")!.split(/\s+/).map(Number);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("card labels option", () => {
  it("shows text by default, and labels: false draws none", async () => {
    const on = await mount();
    expect(last().labels).not.toBe(false);
    expect(on.shadowRoot!.querySelector("svg text")).not.toBeNull();
    const off = await mount({ labels: false });
    expect(last().labels).toBe(false);
    expect(off.shadowRoot!.querySelector("svg text")).toBeNull();
    expect(off.shadowRoot!.querySelector("svg [data-x]")).not.toBeNull(); // icons stay
  });

  it("junk is true: only a real false hides", async () => {
    for (const v of ["false", 0, null, "no", {}, []]) {
      const el = await mount({ labels: v as never });
      expect(last().labels, String(v)).not.toBe(false);
      expect(el.shadowRoot!.querySelector("svg text"), String(v)).not.toBeNull();
      el.remove();
    }
  });
});

describe("card tilt option and menu steps", () => {
  it("has no Tilt in 2D; in 2.5D the steps start at the default 0.5 and render with it", async () => {
    expect(await hasTilt(await mount())).toBe(false);
    const el = await mount({ view: "2.5d" });
    expect(await hasTilt(el)).toBe(true);
    expect(await step(el)).toBe(0.5);
    expect(last().tilt).toBe(0.5);
  });

  it("config tilt sets it, clamped; junk is the default", async () => {
    await mount({ view: "2.5d", tilt: 0.8 });
    expect(last().tilt).toBe(0.8);
    await mount({ view: "2.5d", tilt: 9 });
    expect(last().tilt).toBe(1);
    await mount({ view: "2.5d", tilt: -2 });
    expect(last().tilt).toBe(0);
    for (const v of ["0.2", NaN, null, {}]) {
      await mount({ view: "2.5d", tilt: v as never });
      expect(last().tilt, String(v)).toBe(0.5);
    }
  });

  it("the steps run 0..1 and change the render and the box, not the zoom", async () => {
    const el = await mount({ view: "2.5d" });
    await openMenu(el);
    expect([...menuOf(el)!.shadowRoot!.querySelectorAll('[data-value^="tilt:"]')].map((o) => o.getAttribute("data-value"))).toEqual(STEPS.map((v) => `tilt:${v}`));
    const before = el.shadowRoot!.querySelector("svg")!.innerHTML, boxBefore = box(el);
    await drag(el, "1");
    expect(last().tilt).toBe(1);
    expect(await step(el)).toBe(1);
    expect(el.shadowRoot!.querySelector("svg")!.innerHTML).not.toBe(before);
    expect(box(el)[1]).toBeLessThan(boxBefore[1]!); // steeper: the box reaches higher
    await drag(el, "0");
    expect(last().tilt).toBe(0);
  });

  it("a step keeps the zoom", async () => {
    const el = await mount({ view: "2.5d" });
    el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click();
    await el.updateComplete;
    const w = box(el)[2]!;
    await drag(el, "0.75");
    expect(el.shadowRoot!.querySelector("svg")!.getAttribute("class")).toContain("fp-zoomed");
    expect(box(el)[2]).toBeCloseTo(w, 6);
  });

  it("switching to 2D drops the Tilt items and the tilt stays put for when 2.5D comes back", async () => {
    const el = await mount({ view: "2.5d" });
    await drag(el, "0.25");
    await pickItem(el, "view:2d");
    expect(await hasTilt(el)).toBe(false);
    await pickItem(el, "view:2.5d");
    expect(await step(el)).toBe(0.25);
  });

  it("a config tilt between two steps checks the nearest one and the render keeps the exact value", async () => {
    const el = await mount({ view: "2.5d", tilt: 0.8 });
    expect(last().tilt).toBe(0.8);
    expect(await step(el)).toBe(0.75);
  });

  it("view_switch false and kiosk have no Tilt items", async () => {
    expect(await hasTilt(await mount({ view: "2.5d", view_switch: false }))).toBe(false);
    expect(await hasTilt(await mount({ view: "2.5d", kiosk: true }))).toBe(false);
  });

  it("zoom: false keeps the Tilt steps in the menu", async () => {
    const el = await mount({ view: "2.5d", zoom: false });
    expect(await hasTilt(el)).toBe(true);
  });
});
