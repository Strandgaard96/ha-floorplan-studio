import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import "../../src/card/floorplan-studio-card";
import type { FloorplanStudioCard, FloorplanStudioCardConfig } from "../../src/card/floorplan-studio-card";

// Card UI refactor, lane ui-shell (docs/specs/card-ui-refactor.md items 1, 3, 4): the Overview starts folded and
// remembers the viewer's pick; one toolbar (a View segmented control and the View options menu at every width);
// Reset view hidden until the view differs from its start, and focus never stranded on it.

const L = demo as unknown as Layout;
function mockMotion() {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
}
async function mount(config: Partial<FloorplanStudioCardConfig> = {}): Promise<FloorplanStudioCard> {
  const el = document.createElement("floorplan-studio-card") as FloorplanStudioCard;
  document.body.appendChild(el);
  el.setConfig({ layout: structuredClone(L), floor: "ground", ...config } as FloorplanStudioCardConfig);
  await el.updateComplete;
  return el;
}
const q = <T extends Element>(el: FloorplanStudioCard, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const btn = (el: FloorplanStudioCard, label: string) => q<HTMLButtonElement>(el, `button[aria-label="${label}"]`);
const click = async (el: FloorplanStudioCard, b: HTMLElement | null) => {
  b!.click();
  await el.updateComplete;
};
const seg = (el: FloorplanStudioCard, name: string) =>
  [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>('.fp-zoom [role="group"][aria-label="View"] button')].find(
    (b) => b.textContent!.trim() === name,
  ) ?? null;

beforeEach(() => {
  localStorage.clear();
  mockMotion();
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("shell 1: the Overview starts folded", () => {
  it("is folded on a fresh card, whatever the width: one head, no body", async () => {
    const el = await mount();
    expect(q(el, ".fp-active")!.classList.contains("fp-active-folded")).toBe(true);
    expect(q(el, ".fp-active-body")).toBeNull();
    expect(q(el, ".fp-active-head .fp-crumb")).not.toBeNull(); // the breadcrumb stays on the one line
  });

  it("a tap on the head's button opens it, and the pick is kept for the next card of this viewer", async () => {
    const el = await mount();
    await click(el, btn(el, "Expand the overview"));
    expect(q(el, ".fp-active-body")).not.toBeNull();
    const again = await mount();
    expect(again.shadowRoot!.querySelector(".fp-active-body")).not.toBeNull(); // the open pick wins over the default
    await click(again, btn(again, "Collapse the overview"));
    const third = await mount();
    expect(third.shadowRoot!.querySelectorAll(".fp-active-folded")).toHaveLength(1);
  });

  it("a tap anywhere on the folded line opens it (not only the arrow)", async () => {
    const el = await mount();
    await click(el, q(el, ".fp-active-folded .fp-active-title"));
    expect(q(el, ".fp-active-body")).not.toBeNull();
  });
});

describe("shell 3: one toolbar", () => {
  it("View is a segmented control: a named group of pressed-state buttons, no select", async () => {
    const el = await mount({ view: "2.5d" });
    const group = q(el, '.fp-zoom [role="group"][aria-label="View"]');
    expect(group).not.toBeNull();
    expect([...group!.querySelectorAll("button")].map((b) => b.textContent!.trim())).toEqual(["2D", "2.5D", "3D"]);
    expect(seg(el, "2.5D")!.getAttribute("aria-pressed")).toBe("true");
    expect(seg(el, "2D")!.getAttribute("aria-pressed")).toBe("false");
    expect(q(el, 'select[aria-label="View"]')).toBeNull();
    await click(el, seg(el, "2D"));
    expect(seg(el, "2D")!.getAttribute("aria-pressed")).toBe("true");
    expect(seg(el, "2.5D")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("every other look control is behind View options, closed by default, at any width", async () => {
    const el = await mount({ view: "2.5d" });
    for (const sel of [
      'select[aria-label="Theme"]',
      'select[aria-label="Walls"]',
      'input[aria-label="Tilt"]',
      'button[aria-label="Labels"]',
      'button[aria-label="Device names"]',
      'button[aria-label="Floor below"]',
    ])
      expect(q(el, `.fp-zoom ${sel}`), `${sel} hidden while the menu is closed`).toBeNull();
    const toggle = btn(el, "View options")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(el, toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const menu = q(el, ".fp-view-menu")!;
    expect(menu).not.toBeNull();
    for (const sel of [
      'select[aria-label="Theme"]',
      'select[aria-label="Walls"]',
      'input[aria-label="Tilt"]',
      'button[aria-label="Labels"]',
      'button[aria-label="Device names"]',
      'button[aria-label="Floor below"]',
    ])
      expect(menu.querySelector(sel), `${sel} in the menu`).not.toBeNull();
    // the tilt slider has a visible label of its own
    expect(menu.querySelector('input[aria-label="Tilt"]')!.closest("label")!.textContent).toContain("Tilt");
  });

  it("in 2D the menu has no Tilt but still Theme and Floor below", async () => {
    const el = await mount({ view: "2d" });
    await click(el, btn(el, "View options"));
    const menu = q(el, ".fp-view-menu")!;
    expect(menu.querySelector('input[aria-label="Tilt"]')).toBeNull(); // 2D has no lift
    expect(menu.querySelector('select[aria-label="Theme"]')).not.toBeNull();
    expect(menu.querySelector('button[aria-label="Floor below"]')).not.toBeNull();
  });

  it("view_switch: false hides the whole toolbar, menu included", async () => {
    const el = await mount({ view_switch: false });
    expect(q(el, ".fp-zoom [role=group]")).toBeNull();
    expect(btn(el, "View options")).toBeNull();
  });
});

describe("shell 4: Reset view is hidden until the view differs", () => {
  it("is hidden (not disabled) at the start, shown after a change, hidden again after the reset", async () => {
    const el = await mount();
    expect(btn(el, "Reset view")!.hidden).toBe(true);
    expect(btn(el, "Reset view")!.disabled).toBe(false);
    await click(el, btn(el, "Rotate right"));
    expect(btn(el, "Reset view")!.hidden).toBe(false);
    await click(el, btn(el, "Reset view"));
    expect(btn(el, "Reset view")!.hidden).toBe(true);
  });

  it("focus does not stay on the button that just went away", async () => {
    const el = await mount();
    await click(el, btn(el, "Rotate right"));
    const reset = btn(el, "Reset view")!;
    reset.focus();
    expect(el.shadowRoot!.activeElement).toBe(reset);
    await click(el, reset);
    await el.updateComplete;
    const now = el.shadowRoot!.activeElement as HTMLElement | null;
    expect(now).not.toBeNull();
    expect(now!.hidden).toBe(false);
    expect(now).not.toBe(reset);
  });
});

describe("shell 1a: the default detail is full", () => {
  const level = (el: FloorplanStudioCard) => q(el, "svg g[data-detail]")?.getAttribute("data-detail");
  it("an unset detail draws everything (near); detail: auto still thins the plan at fit; a viewer's pick wins", async () => {
    expect(level(await mount())).toBe("near");
    expect(level(await mount({ detail: "auto" }))).toBe("far");
    expect(level(await mount({ detail: "minimal" }))).toBe("far");
  });
  it("junk in detail is the default, full", async () => {
    expect(level(await mount({ detail: "nonsense" as never }))).toBe("near");
  });
});
