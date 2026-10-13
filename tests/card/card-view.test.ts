import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";

// renderFloor is wrapped, not replaced (the same trick card.test.ts uses): the markup is real, and the test can read
// the `view` the card handed to core.
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import "../../src/card/floorplan-studio-card";
import { hasMenuItem, menuOf, openMenu, pickItem, stateOfItem } from "./menu-dom"; // defines the element
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const lastView = () => ((renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts).view;

async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
// S31.6: the View choice is three radio items of the header menu, `view:2d`, `view:2.5d`, `view:3d`.
const checked = async (el: FloorplanStudioCard) => {
  for (const v of ["2d", "2.5d", "3d"]) if ((await stateOfItem(el, `view:${v}`)) === "true") return v;
  return null;
};
const pick = (el: FloorplanStudioCard, value: string) => pickItem(el, `view:${value}`);
const box = (el: FloorplanStudioCard) => el.shadowRoot!.querySelector("svg")!.getAttribute("viewBox")!.split(/\s+/).map(Number);
const click = async (el: FloorplanStudioCard, label: string) => {
  el.shadowRoot!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
  await el.updateComplete;
};

describe("card view option and dropdown", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is 2D with a View group in the header menu, the zoom buttons in the stack, by default", async () => {
    const el = await mount();
    expect(lastView()).toBe("2d");
    expect(await checked(el)).toBe("2d");
    await openMenu(el);
    const radios = [...menuOf(el)!.shadowRoot!.querySelectorAll('[role="menuitemradio"]')].map((o) => [o.getAttribute("data-value"), o.querySelector(".text")!.textContent!.trim()]);
    expect(radios.slice(0, 3)).toEqual([["view:2d", "2D"], ["view:2.5d", "2.5D"], ["view:3d", "3D"]]);
    // S31.6: no select in the toolbar any more; zoom is in the vertical stack, as in the studio.
    expect(el.shadowRoot!.querySelector("select")).toBeNull();
    expect(el.shadowRoot!.querySelector('button[aria-label="Zoom in"]')!.closest(".fp-stack")).not.toBeNull();
  });

  it("view: 2.5d starts in 2.5D and the menu says so", async () => {
    const el = await mount({ view: "2.5d" });
    expect(lastView()).toBe("2.5d");
    expect(await checked(el)).toBe("2.5d");
    expect(el.shadowRoot!.querySelector("svg .bs")).not.toBeNull(); // wall faces really are drawn
  });

  it("a junk view falls back to 2D, and does not throw", async () => {
    for (const v of ["", 2.5, null, {}, "2.5D", "3D", "4d"]) {
      const el = await mount({ view: v as never });
      expect(lastView(), String(v)).toBe("2d");
      expect(await checked(el)).toBe("2d");
      el.remove();
    }
  });

  it("choosing 2.5D redraws the plan in 2.5D, and choosing 2D draws it flat again", async () => {
    const el = await mount();
    await pick(el, "2.5d");
    expect(lastView()).toBe("2.5d");
    expect(el.shadowRoot!.querySelector("svg .ws")).not.toBeNull();
    await pick(el, "2d");
    expect(lastView()).toBe("2d");
    expect(el.shadowRoot!.querySelector("svg .ws")).toBeNull();
  });

  it("ignores a pick that is not an item of the menu", async () => {
    const el = await mount();
    for (const value of ["view:4d", "view:", "view", "view:2D"]) {
      menuOf(el)!.dispatchEvent(new CustomEvent("fp-menu-pick", { detail: { value }, bubbles: true, composed: true }));
      await el.updateComplete;
      expect(lastView(), value).toBe("2d");
    }
  });

  it("switching view keeps the zoom: the card stays zoomed in, and the zoomed box is narrower than the new fit", async () => {
    const el = await mount();
    await click(el, "Zoom in");
    const svg = el.shadowRoot!.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("fp-zoomed");
    const zoomedFlat = box(el);
    await pick(el, "2.5d");
    expect(svg.getAttribute("class")).toContain("fp-zoomed");
    const zoomed = box(el);
    await click(el, "Fit");
    const fit25 = box(el);
    expect(zoomed[2]).toBeCloseTo(zoomedFlat[2]!, 6); // the zoom level itself did not move
    expect(zoomed[2]).toBeLessThan(fit25[2]!);
  });

  it("view_switch: false drops the View items but keeps the configured view", async () => {
    const el = await mount({ view: "2.5d", view_switch: false });
    expect(await hasMenuItem(el, "view:2d")).toBe(false);
    expect(lastView()).toBe("2.5d");
    expect(el.shadowRoot!.querySelector('button[aria-label="Zoom in"]')).not.toBeNull();
  });

  it("kiosk has no View items either, whatever view_switch says", async () => {
    const el = await mount({ kiosk: true, view_switch: true, view: "2.5d" });
    expect(await hasMenuItem(el, "view:2d")).toBe(false);
    expect(lastView()).toBe("2.5d");
  });

  it("only view_switch: false hides it: junk keeps the default, shown", async () => {
    for (const v of ["no", 0, null, "false"]) {
      const el = await mount({ view_switch: v as never });
      expect(await hasMenuItem(el, "view:2d"), String(v)).toBe(true);
      el.remove();
    }
  });

  it("zoom: false still gets the View items, and no zoom buttons", async () => {
    const el = await mount({ zoom: false });
    expect(await hasMenuItem(el, "view:2d")).toBe(true);
    expect(el.shadowRoot!.querySelector('button[aria-label="Zoom in"]')).toBeNull();
  });

  // Since the card remembers its view, the same config set again keeps the pick (card-view-memory.test.ts). A
  // config that differs in `rotation` is another card to the memory, so it starts from its own config.
  it("a new config puts the view back to the configured one", async () => {
    const el = await mount({ view: "2.5d" });
    await pick(el, "2d");
    expect(lastView()).toBe("2d");
    el.setConfig({ layout: structuredClone(L), floor: "ground", view: "2.5d", rotation: 90 } as FloorplanStudioCardConfig);
    await el.updateComplete;
    expect(lastView()).toBe("2.5d");
    expect(await checked(el)).toBe("2.5d");
  });

  it("a hass update does not undo the pick", async () => {
    const el = await mount();
    await pick(el, "2.5d");
    el.hass = { states: {} } as never;
    await el.updateComplete;
    expect(lastView()).toBe("2.5d");
  });
});
