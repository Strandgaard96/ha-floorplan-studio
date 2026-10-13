import { describe, it, expect } from "vitest";
import { FLOORPLAN_CSS, renderFloor, type StateOverlay } from "../../src/core/render";
import type { Floor } from "../../src/core/schema";

// Diego, 2026-10-12: "in studio doors are not visible". S25.D1 made a sensorless door a hole, and the Studio has no live state,
// so every door there was an invisible gap. In the editor alone a hole draws a faint guide line; the card keeps its hole.

const st = (state: string) => ({ state, attributes: {}, last_changed: "2026-10-12T10:00:00Z" });
const floor = (d: Record<string, unknown>): Floor => ({
  title: "T", outline: [[0, 0], [400, 0], [400, 300], [0, 300]], owk: ["external", "none", "none", "none"], rooms: [],
  walls: [], stairs: [], doors: [{ id: "d", name: "D", kind: "door", a: [100, 0], b: [200, 0], ...d }] as never, openings: [], extras: [], devices: [], furniture: [], unlinked: [],
});
const draw = (f: Floor, o: { editor?: boolean; state?: StateOverlay; selection?: { t: "door"; i: number } } = {}) => renderFloor(f, { scale: 1, view: "2d", ...o } as never);
const line = (html: string) => [...html.matchAll(/<line data-d="0" class="(door [^"]*)"/g)].map((m) => m[1]!)[0] ?? "";

describe("the editor's door guide", () => {
  for (const kind of ["door", "glass"]) {
    it(`${kind} with no sensor: guide in the editor, quiet hole in the card`, () => {
      const f = floor({ kind });
      expect(line(draw(f, { editor: true }))).toMatch(/\bguide\b/);
      expect(line(draw(f, { editor: true }))).not.toMatch(/\bquiet\b/);
      expect(line(draw(f))).not.toMatch(/\bguide\b/);
      expect(line(draw(f))).toMatch(/\bquiet\b/);
    });
  }
  it("a closed door keeps its thick line, not the guide", () => {
    const f = floor({ sensors: ["binary_sensor.d"] });
    const html = draw(f, { editor: true, state: { "binary_sensor.d": st("off") } });
    expect(line(html)).not.toMatch(/\bguide\b|\bquiet\b/);
  });
  it("a selected door, an open door and the hit line are as before", () => {
    const f = floor({});
    expect(line(draw(f, { editor: true, selection: { t: "door", i: 0 } }))).not.toMatch(/\bguide\b/);
    expect(draw(f, { editor: true })).toContain('class="door-hit"');
    const g = floor({ sensors: ["binary_sensor.d"] });
    expect(line(draw(g, { editor: true, state: { "binary_sensor.d": st("on") } }))).not.toMatch(/\bguide\b/);
  });
  it("windows and the doorway kind get no guide (they have a symbol or draw nothing)", () => {
    for (const kind of ["window", "slit", "fullwindow", "open"]) expect(line(draw(floor({ kind }), { editor: true })), kind).not.toMatch(/\bguide\b/);
  });
  it("the guide has a rule in the stylesheet", () => { expect(FLOORPLAN_CSS).toMatch(/\.door\.guide\{/); });
});
