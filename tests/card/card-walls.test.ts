import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import type { RenderOpts } from "../../src/core/render";
import { WALLS_LABELS, WALLS_MODES } from "../../src/core/solids";

// Same wrapper as card-labels-tilt.test.ts: real markup, and the test reads what the card handed to core.
vi.mock("../../src/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core")>();
  return { ...actual, renderFloor: vi.fn(actual.renderFloor) };
});
import { renderFloor } from "../../src/core";
import { hasMenuItem, menuItemDisabled, menuOf, openMenu, pickItem, stateOfItem } from "./menu-dom";
import "../../src/card/floorplan-studio-card";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

const L = demo as unknown as Layout;
const last = () => (renderFloor as unknown as Mock).mock.calls.at(-1)![1] as RenderOpts;

async function mount(config: Record<string, unknown> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", view: "2.5d", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
// S31.6: Walls is a radio group of the header menu, `walls:<mode>`; Reset view is its `reset` action.
const pick = (el: FloorplanStudioCard, value: string) => pickItem(el, `walls:${value}`);
const current = async (el: FloorplanStudioCard) => {
  for (const m of WALLS_MODES) if ((await stateOfItem(el, `walls:${m}`)) === "true") return m;
  return null;
};
const stored = () => Object.keys(localStorage).filter((k) => k.startsWith("fp-view:")).map((k) => JSON.parse(localStorage.getItem(k)!));

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("card walls option", () => {
  it("is cut by default and passes the configured mode to renderFloor", async () => {
    await mount();
    expect(last().walls).toBe("cut");
    for (const m of WALLS_MODES) {
      localStorage.clear();
      await mount({ walls: m });
      expect(last().walls, m).toBe(m);
    }
  });

  it("junk config is cut (YAML is untrusted)", async () => {
    for (const v of ["FULL", "tall", "", 3, null, true, ["full"], { a: 1 }, "__proto__"]) {
      localStorage.clear();
      await mount({ walls: v });
      expect(last().walls, JSON.stringify(v)).toBe("cut");
    }
  });

  it("the menu lists every mode with its label, and checks the current one", async () => {
    const el = await mount({ walls: "low" });
    await openMenu(el);
    const items = [...menuOf(el)!.shadowRoot!.querySelectorAll('[data-value^="walls:"]')];
    expect(items.map((o) => [o.getAttribute("data-value"), o.querySelector(".text")!.textContent!.trim()])).toEqual(WALLS_MODES.map((m) => [`walls:${m}`, WALLS_LABELS[m]]));
    expect(await current(el)).toBe("low");
  });

  it("is in the menu right after the Tilt steps, in 2.5D only", async () => {
    const on = await mount();
    await openMenu(on);
    const order = [...menuOf(on)!.shadowRoot!.querySelectorAll("[data-value]")].map((o) => o.getAttribute("data-value")!);
    expect(order.map((v) => v.startsWith("tilt:")).lastIndexOf(true) + 1).toBe(order.findIndex((v) => v.startsWith("walls:")));
    const flat = await mount({ view: "2d" });
    expect(await hasMenuItem(flat, "walls:cut")).toBe(false);
  });

  it("a pick redraws with that mode and is stored at once", async () => {
    const el = await mount();
    await pick(el, "full");
    expect(last().walls).toBe("full");
    expect(stored().map((s) => s.walls)).toEqual(["full"]);
  });

  it("a junk pick is refused", async () => {
    const el = await mount();
    menuOf(el)!.dispatchEvent(new CustomEvent("fp-menu-pick", { detail: { value: "walls:tall" }, bubbles: true, composed: true }));
    await el.updateComplete;
    expect(last().walls).toBe("cut");
    expect(stored()).toEqual([]);
  });

  it("a stored mode is in force at the first render and wins over the config", async () => {
    const el = await mount({ walls: "low" });
    await pick(el, "full");
    document.body.innerHTML = "";
    const again = await mount({ walls: "low" });
    expect(last().walls).toBe("full");
    expect(await current(again)).toBe("full");
  });

  it("a hostile stored mode is dropped and the config stays in charge", async () => {
    const el = await mount({ walls: "low" });
    await pick(el, "full");
    const key = Object.keys(localStorage).find((k) => k.startsWith("fp-view:"))!;
    localStorage.setItem(key, JSON.stringify({ v: 1, walls: "tall", tilt: 0.2 }));
    document.body.innerHTML = "";
    await mount({ walls: "low" });
    expect(last().walls).toBe("low");
  });

  it("Reset view returns to the config's mode and clears the stored one", async () => {
    const el = await mount({ walls: "low" });
    await pick(el, "full");
    expect(await menuItemDisabled(el, "reset")).toBe(false);
    await pickItem(el, "reset");
    expect(last().walls).toBe("low");
    expect(stored()).toEqual([]);
  });
});
