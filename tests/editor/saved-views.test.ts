import { describe, it, expect } from "vitest";
import align from "../fixtures/align-house.json";
import type { Layout } from "../../src/core/schema";
import { MAX_VIEWS, validate } from "../../src/core";
import { EditorState } from "../../src/editor/state";

// S33.7. Saved views in the Studio: the writers on EditorState. Three floors, so delete, move and rename are different floors.
const three = (): Layout => {
  const l = structuredClone(align) as unknown as Layout;
  l.floors.second = structuredClone(l.floors.first);
  l.floors.second.title = "Second";
  return l;
};
const mk = () => new EditorState(three());
const ok = (s: EditorState) => { const r = validate(s.layout); expect(r.ok ? [] : r.errors).toEqual([]); };
const steps = (s: EditorState) => { let n = 0; const keep = JSON.stringify(s.layout); while (s.undo()) n++; while (s.redo()) { /* back to the end */ } expect(JSON.stringify(s.layout)).toBe(keep); return n; };

describe("saveView", () => {
  it("stores the floor on show and the turn, and nothing of zoom when the floor is shown whole", () => {
    const s = mk(); s.setFloor("first"); s.viewRot = 90; s.fit();
    const id = s.saveView("Upstairs");
    expect(id).not.toBe("");
    expect(s.layout.views).toEqual([{ id, name: "Upstairs", floor: "first", rotation: 90 }]);
    ok(s);
  });
  it("leaves the turn out at 0 and the mode out when it is the viewer's choice", () => {
    const s = mk(); s.fit();
    const id = s.saveView("Whole");
    expect(s.layout.views![0]).toEqual({ id, name: "Whole", floor: s.floor });
  });
  it("stores the mode when one is chosen", () => {
    const s = mk(); s.fit();
    s.saveView("Flat", "2d");
    expect(s.layout.views![0].mode).toBe("2d");
  });
  it("stores zoom and centre together when the floor is zoomed in, against the card's fit", () => {
    const s = mk(); s.fit();
    const v = s.view; // zoom in 4x on a point that is not the middle
    const cx = v.x + v.w * 0.25, cy = v.y + v.h * 0.25;
    s.views[s.floor] = { x: cx - v.w / 8, y: cy - v.h / 8, w: v.w / 4, h: v.h / 4 };
    s.saveView("Corner");
    const sv = s.layout.views![0];
    expect(sv.zoom).toBeGreaterThan(3); expect(sv.zoom).toBeLessThanOrEqual(8);
    expect(sv.center![0]).toBeCloseTo(cx, 0); expect(sv.center![1]).toBeCloseTo(cy, 0);
    ok(s);
  });
  it("clamps zoom to the card's 8 and keeps a valid layout", () => {
    const s = mk(); s.fit();
    const v = s.view;
    s.views[s.floor] = { x: v.x + 10, y: v.y + 10, w: v.w / 50, h: v.h / 50 };
    s.saveView("Deep");
    expect(s.layout.views![0].zoom).toBe(8);
    ok(s);
  });
  it("a floor zoomed out past the whole, or panned out of the centre while zoomed out, is shown whole: no zoom, no centre", () => {
    const s = mk(); s.fit();
    const v = s.view;
    s.views[s.floor] = { x: v.x - v.w, y: v.y - v.h, w: v.w * 3, h: v.h * 3 };
    s.saveView("Out");
    const sv = s.layout.views![0];
    expect(sv.zoom).toBeUndefined(); expect(sv.center).toBeUndefined();
    ok(s);
  });
  it("one undo step, a name is trimmed, ids are unique, and an empty or long name, or a 25th view, is refused with no step", () => {
    const s = mk(); s.fit();
    const a = s.saveView("  Same  "), b = s.saveView("Same");
    expect(a).not.toBe(b);
    expect(s.layout.views!.map((v) => v.name)).toEqual(["Same", "Same"]);
    expect(steps(s)).toBe(2);
    const t = mk(); t.fit();
    expect(t.saveView("   ")).toBe(""); expect(t.saveView("x".repeat(61))).toBe("");
    expect(t.canUndo).toBe(false); expect(t.layout.views).toBeUndefined();
    for (let i = 0; i < MAX_VIEWS; i++) expect(t.saveView(`v${i}`)).not.toBe("");
    const before = JSON.stringify(t.layout);
    expect(t.saveView("one too many")).toBe("");
    expect(JSON.stringify(t.layout)).toBe(before);
    ok(t);
  });
  it("a name of \"><script> is kept as text", () => {
    const s = mk(); s.fit();
    s.saveView('"><script>alert(1)</script>');
    expect(s.layout.views![0].name).toBe('"><script>alert(1)</script>');
    ok(s);
  });
  it("is allowed under Lock plan: a view is not geometry", () => {
    const s = mk(); s.planLocked = true; s.fit();
    expect(s.saveView("Locked")).not.toBe("");
  });
});

describe("renameView, deleteView", () => {
  const withTwo = () => { const s = mk(); s.fit(); const a = s.saveView("A"), b = s.saveView("B"); return { s, a, b }; };
  it("rename is one step, none when the name is unchanged (after trim), empty, too long or unknown", () => {
    const { s, a } = withTwo();
    expect(s.renameView(a, " A ")).toBe(false);
    expect(s.renameView(a, "")).toBe(false);
    expect(s.renameView(a, "y".repeat(61))).toBe(false);
    expect(s.renameView("nope", "Z")).toBe(false);
    expect(s.renameView("__proto__", "Z")).toBe(false);
    const n = steps(s);
    expect(s.renameView(a, "Alpha")).toBe(true);
    expect(s.layout.views![0].name).toBe("Alpha");
    expect(steps(s)).toBe(n + 1);
    ok(s);
  });
  it("delete is one step, undo brings the view back in its place; deleting the last view leaves no empty key", () => {
    const { s, a, b } = withTwo();
    expect(s.deleteView("nope")).toBe(false);
    expect(s.deleteView(a)).toBe(true);
    expect(s.layout.views!.map((v) => v.id)).toEqual([b]);
    s.undo();
    expect(s.layout.views!.map((v) => v.id)).toEqual([a, b]);
    s.redo(); s.deleteView(b);
    expect("views" in s.layout).toBe(false);
    ok(s);
  });
});

describe("applyView is not an edit", () => {
  it("sets floor, turn and zoom; a whole-floor view fits the floor and drops a turn the view does not name", () => {
    const s = mk(); s.setFloor("first"); s.viewRot = 135; s.fit();
    const v = s.view;
    s.views[s.floor] = { x: v.x + 50, y: v.y + 50, w: v.w / 3, h: v.h / 3 };
    const zoomed = s.saveView("Zoomed");
    s.setFloor("ground"); s.viewRot = 0; s.fit();
    const whole = s.saveView("Whole");
    s.setFloor("second"); s.viewRot = 45;
    const undo = s.canUndo, json = JSON.stringify(s.layout);
    expect(s.applyView(zoomed)).toBe(true);
    expect(s.floor).toBe("first"); expect(s.viewRot).toBe(135);
    expect(s.view.w).toBeLessThan(v.w);
    expect(s.applyView(whole)).toBe(true);
    expect(s.floor).toBe("ground"); expect(s.viewRot).toBe(0);
    const g = s.view, fitNow = (() => { const t = new EditorState(s.layout, "ground"); t.fit(); return t.view; })();
    expect(g.w).toBeCloseTo(fitNow.w, 3);
    expect(s.canUndo).toBe(undo); expect(JSON.stringify(s.layout)).toBe(json);
    expect(s.applyView("nope")).toBe(false);
  });
});

describe("every floor operation on a layout with views (criterion 9)", () => {
  const withViews = () => { const s = mk(); for (const f of ["ground", "first", "second"]) { s.setFloor(f); s.fit(); s.saveView(`view ${f}`); } return s; };
  it("Delete floor drops that floor's views in the same undo step; Undo brings them back", () => {
    const s = withViews();
    const before = JSON.stringify(s.layout), n = steps(s);
    expect(s.deleteFloor("first")).toBe(true);
    expect(s.layout.views!.map((v) => v.floor)).toEqual(["ground", "second"]);
    ok(s);
    expect(steps(s)).toBe(n + 1);
    s.undo();
    expect(JSON.stringify(s.layout)).toBe(before);
  });
  it("Delete floor on the floor that has all the views removes the key, not an empty list", () => {
    const s = mk(); s.setFloor("first"); s.fit(); s.saveView("only");
    s.deleteFloor("first");
    expect("views" in s.layout).toBe(false);
    ok(s);
  });
  for (const [name, run] of [
    ["add floor", (s: EditorState) => s.addFloor("Attic")],
    ["rename floor", (s: EditorState) => s.renameFloor("first", "Renamed")],
    ["move floor up", (s: EditorState) => s.moveFloor("ground", 1)],
    ["move floor down", (s: EditorState) => s.moveFloor("second", -1)],
    ["delete floor", (s: EditorState) => s.deleteFloor("ground")],
    ["delete the last of three", (s: EditorState) => s.deleteFloor("second")],
    ["replace the layout", (s: EditorState) => s.setLayout(JSON.parse(JSON.stringify(s.layout)) as Layout, "second", true)],
    ["save, rename and delete a view", (s: EditorState) => { const id = s.saveView("tmp"); s.renameView(id, "tmp2"); s.deleteView(id); }],
  ] as [string, (s: EditorState) => unknown][]) {
    it(`${name}: validate passes after it and after Undo and Redo`, () => {
      const s = withViews();
      run(s); ok(s);
      s.undo(); ok(s);
      s.redo(); ok(s);
      for (const v of s.layout.views ?? []) expect(Object.keys(s.layout.floors)).toContain(v.floor);
    });
  }
  it("a floor added again under a deleted floor's key starts with none of its old views", () => {
    const s = withViews();
    s.deleteFloor("first");
    s.addFloor("First");
    expect(s.layout.views!.filter((v) => v.floor === "first")).toEqual([]);
  });
});
