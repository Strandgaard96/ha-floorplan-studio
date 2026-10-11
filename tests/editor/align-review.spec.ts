import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Layout } from "../../src/core/schema";
import { floorPivot, stairPlace, stairReport, floorPlace } from "../../src/core";
import { FIRST_TO_GROUND } from "../fixtures/hand-align-truth";

// Opus review of Sprint 29, findings 1, 2, 3, 4 and 7, in the Studio. Real page.mouse and page.keyboard (finding 3 of CLAUDE.md).
//  1. Align is read-only: a press on the plan never edits geometry; Delete does nothing; a draw closes it; align keys never run in a draw or a text field.
//  2. The rotation box turns about the pivot the Turn buttons use.
//  3. Align stairs says "Already aligned" for a pose that does not change, not "beyond the limit".
//  4. The report and the button pick the same stair below.
//  7. The boxes take decimal text only; a stored -180 is not rewritten by a no-op edit.

const EDITOR = "floorplan-studio-editor";
const FIXTURE = JSON.parse(readFileSync("tests/fixtures/hand-align-house.json", "utf8"));
const layoutOf = (page: Page) => page.evaluate((tag) => JSON.parse(JSON.stringify((document.querySelector(tag) as any).layout)) as Layout, EDITOR);
const poseOf = async (page: Page) => { const f = (await layoutOf(page)).floors.first as any; return { rot: f.rotation ?? 0, off: (f.offset ?? [0, 0]) as [number, number] }; };
const depth = (page: Page) => page.evaluate((tag) => (document.querySelector(tag) as any).st.hist.length as number, EDITOR);
const viewBox = (page: Page) => page.evaluate((tag) => (document.querySelector(tag) as any).shadowRoot.querySelector("svg").getAttribute("viewBox") as string, EDITOR);
const status = (page: Page) => page.locator("#status");

async function setup(page: Page, mutate?: (l: any) => void) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/standalone.html");
  await expect(page.locator(`${EDITOR} svg polygon[data-r]`).first()).toBeVisible();
  await page.locator("#fixPlan").uncheck();
  const l = JSON.parse(JSON.stringify(FIXTURE));
  mutate?.(l);
  await page.evaluate(([tag, x]) => { (document.querySelector(tag as string) as any).layout = x; }, [EDITOR, l] as const);
  await page.locator('.chip[data-f="first"]').click();
}
const openAlign = async (page: Page) => { await page.locator("#mFloors > summary").click(); await page.locator("#alignFloor").click(); await expect(page.locator("#alignPanel")).toBeVisible(); };
async function press(page: Page, sel: string) {
  const b = page.locator(sel);
  await b.scrollIntoViewIfNeeded();
  const r = (await b.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}
/** A screen point where `sel` is the top element (checked with elementFromPoint, like a real press). */
const pointOn = (page: Page, sel: string) => page.evaluate(([tag, s]) => {
  const root = (document.querySelector(tag) as any).shadowRoot as ShadowRoot, el = root.querySelector(s)!, r = el.getBoundingClientRect();
  for (let a = 1; a < 16; a++) for (let b = 1; b < 16; b++) {
    const x = r.left + (r.width * a) / 16, y = r.top + (r.height * b) / 16;
    if (root.elementFromPoint(x, y)?.closest(s) === el) return { x, y };
  }
  return null;
}, [EDITOR, sel] as const);

// ---- 1. read-only ----

const WITH_WALL = (l: any) => { l.floors.first.walls.push({ a: [700, 100], b: [700, 400], kind: "external" }); };

test("1. Align is read-only: a press, a drag, a right click, a double click, Delete and Backspace change nothing", async ({ page }) => {
  await setup(page, WITH_WALL);
  await openAlign(page);
  const l0 = JSON.stringify(await layoutOf(page)), d0 = await depth(page);
  for (const sel of ['[data-w="0"]', '[data-s="0"]', '[data-r="0"]']) {
    const p = await pointOn(page, sel);
    expect(p, `${sel} is on the plan`).not.toBeNull();
    await page.mouse.move(p!.x, p!.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(p!.x + i * 5, p!.y + i * 3);
    await page.mouse.up();
    expect(await page.evaluate((tag) => (document.querySelector(tag) as any).st.sel, EDITOR), `${sel} not selected`).toBeNull();
    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");
    const q = (await pointOn(page, sel))!;
    await page.mouse.click(q.x, q.y, { button: "right" });
    await page.mouse.dblclick(q.x, q.y);
    await page.keyboard.press("Delete");
    expect(await page.evaluate((tag) => (document.querySelector(tag) as any).ctxMenu, EDITOR), `${sel} no context menu`).toBeFalsy();
    expect(JSON.stringify(await layoutOf(page)), sel).toBe(l0);
    expect(await depth(page), sel).toBe(d0);
  }
  await expect(page.locator("#alignPanel")).toBeVisible();
});

test("1. a selection made before Align is gone when Align opens, and Delete then removes nothing", async ({ page }) => {
  await setup(page, WITH_WALL);
  const p = (await pointOn(page, '[data-w="0"]'))!;
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate((tag) => (document.querySelector(tag) as any).st.sel?.t, EDITOR)).toBe("wall");
  await openAlign(page);
  expect(await page.evaluate((tag) => (document.querySelector(tag) as any).st.sel, EDITOR)).toBeNull();
  // even a selection put there by other means cannot be deleted while Align is open
  await page.evaluate((tag) => { const e = document.querySelector(tag) as any; e.st.sel = { t: "wall", i: 0 }; e.requestUpdate(); }, EDITOR);
  const l0 = JSON.stringify(await layoutOf(page));
  await page.locator(EDITOR).focus();
  await page.keyboard.press("Delete");
  expect(JSON.stringify(await layoutOf(page))).toBe(l0);
});

test("1. in Align the plan still pans and zooms", async ({ page }) => {
  await setup(page, WITH_WALL);
  await openAlign(page);
  const box = (await page.locator(`${EDITOR} .canvas > svg`).boundingBox())!;
  const x = box.x + 6, y = box.y + 6;
  const v0 = await viewBox(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 8, y + i * 6);
  await page.mouse.up();
  const v1 = await viewBox(page);
  expect(v1, "pan").not.toBe(v0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => viewBox(page), "zoom").not.toBe(v1);
});

test("1. starting a draw closes Align, and a '.' typed into the draw length does not turn the floor", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  const d0 = await depth(page);
  await page.locator("#mAdd > summary").click();
  await page.locator("#addWallSub > summary").click();
  await page.locator("#drawWallSub > summary").click();
  await page.locator('[id^="drawWall-"]').first().click();
  expect(await page.evaluate((tag) => { const e = document.querySelector(tag) as any; return { draw: !!e.draw, key: e.alignKey, mode: e.asideMode }; }, EDITOR)).toEqual({ draw: true, key: null, mode: "selection" });
  await expect(page.locator("#alignPanel")).toHaveCount(0);
  const c = (await page.locator(`${EDITOR} .canvas > svg`).boundingBox())!;
  await page.mouse.click(c.x + 200, c.y + 200);
  await page.mouse.move(c.x + 420, c.y + 230, { steps: 4 });
  await page.keyboard.press("1"); await page.keyboard.press("."); await page.keyboard.press("5");
  expect(await page.evaluate((tag) => (document.querySelector(tag) as any).draw.typed, EDITOR)).toBe("1.5");
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
  expect(await depth(page)).toBe(d0);
});

test("1. even with Align and a draw both set, the align keys do not run (guard in the key handler)", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  await page.evaluate((tag) => { const e = document.querySelector(tag) as any; e.startDraw("wall"); e.asideMode = "align"; e.alignKey = e.st.floor; }, EDITOR);
  const c = (await page.locator(`${EDITOR} .canvas > svg`).boundingBox())!;
  await page.mouse.click(c.x + 200, c.y + 200);
  await page.keyboard.press("."); await page.keyboard.press(",");
  await page.keyboard.press("ArrowRight");
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
});

test("1. a text field keeps '.' ',' and the arrows", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  const d0 = await depth(page);
  await page.locator("#alignX").fill("");
  await page.keyboard.type("1.5,");
  await page.keyboard.press("ArrowLeft");
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
  expect(await depth(page)).toBe(d0);
  await expect(page.locator("#alignX")).toHaveValue("1.5,");
});

// ---- 2. one pivot ----

test("2. a typed rotation keeps the pivot's house point fixed, and equals the Turn buttons to the same angle", async ({ page }) => {
  await setup(page);
  const pivot = floorPivot(FIXTURE.floors.first);
  expect(Math.hypot(pivot[0], pivot[1]), "the fixture's pivot is far from the stored origin").toBeGreaterThan(150);
  const house = (p: { rot: number; off: [number, number] }): [number, number] => {
    const a = (p.rot * Math.PI) / 180;
    return [pivot[0] * Math.cos(a) - pivot[1] * Math.sin(a) + p.off[0], pivot[0] * Math.sin(a) + pivot[1] * Math.cos(a) + p.off[1]];
  };
  const h0 = house({ rot: 0, off: [0, 0] });
  await openAlign(page);
  const d0 = await depth(page);
  await page.locator("#alignRot").fill("6");
  await page.locator("#alignRot").press("Enter");
  const typed = await poseOf(page);
  expect(typed.rot).toBe(6);
  expect(await depth(page), "one undo step").toBe(d0 + 1);
  const h1 = house(typed);
  expect(Math.hypot(h1[0] - h0[0], h1[1] - h0[1]), `pivot moved ${JSON.stringify(typed)}`).toBeLessThan(0.1);
  // the same angle by the buttons: 3 degrees twice
  await page.locator("#undo").click();
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
  await press(page, '[data-angle="3"]');
  await press(page, "#alignTurnR");
  await press(page, "#alignTurnR");
  const pressed = await poseOf(page);
  expect(pressed.rot).toBe(6);
  expect(Math.abs(pressed.off[0] - typed.off[0])).toBeLessThanOrEqual(0.1000001);
  expect(Math.abs(pressed.off[1] - typed.off[1])).toBeLessThanOrEqual(0.1000001);
});

// ---- 3. same is not refused ----

test("3. Align stairs pressed twice says 'Already aligned' the second time, with no step and no limit message", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  await press(page, "#alignStairsBtn");
  await expect(status(page)).toContainText("Aligned First stairs");
  const d1 = await depth(page);
  await press(page, "#alignStairsBtn");
  await expect(status(page)).toHaveText("Already aligned");
  expect(await depth(page)).toBe(d1);
});

// ---- 4. one stair ----

test("4. with two stairs on the floor below, the report and Align stairs use the same one", async ({ page }) => {
  await setup(page, (l) => {
    const g = l.floors.ground, far = JSON.parse(JSON.stringify(g.stairs[0]));
    far.id = "stairs-far"; far.name = "Far stairs"; far.pts = far.pts.map((p: number[]) => [p[0] + 1500, p[1] + 1500]);
    g.stairs.unshift(far); // first in the list, but far away
  });
  await openAlign(page);
  const rows = await page.locator("#alignStairs li").allTextContents();
  expect(rows[0]).toContain("from Ground stairs");
  await press(page, "#alignStairsBtn");
  await expect(status(page)).toContainText("to Ground stairs");
  const l = await layoutOf(page), p = floorPlace(l, "first", "ground"), t = stairPlace(l.floors.first, l.floors.ground, p)!;
  expect(stairReport(l.floors.first, l.floors.ground, p)[0].nearest!.name).toBe("Ground stairs");
  expect(t.moved).toBeLessThan(0.5);
  const f = l.floors.first as any;
  expect(Math.abs(f.offset[0] - FIRST_TO_GROUND.shift[0]) + Math.abs(f.offset[1] - FIRST_TO_GROUND.shift[1])).toBeLessThan(6);
});

// ---- 7. decimals only; -180 ----

test("7. the boxes reject hex, exponent and other non-decimal text, and accept 3,5 and -2.25", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  const d0 = await depth(page);
  const type = async (id: string, text: string) => { await page.locator(id).fill(text); await page.locator(id).press("Enter"); };
  for (const bad of ["0x10", "1e3", "1e-1", "Infinity", "0b11", "1_000", "12abc", "--3", "1.2.3", "+", "."]) {
    await type("#alignX", bad);
    await type("#alignRot", bad);
    expect(await depth(page), bad).toBe(d0);
    expect(await poseOf(page), bad).toEqual({ rot: 0, off: [0, 0] });
    await expect(page.locator("#alignX")).toHaveValue("0");
  }
  await type("#alignX", "3,5");
  expect((await poseOf(page)).off[0]).toBe(3.5);
  await type("#alignY", "-2.25");
  expect((await poseOf(page)).off[1]).toBe(-2.2);
  await type("#alignRot", "-2.25");
  expect((await poseOf(page)).rot).toBe(-2.25);
  expect(await depth(page)).toBe(d0 + 3);
});

test("7. a stored rotation of -180 is not rewritten to 180 by a no-op edit", async ({ page }) => {
  await setup(page, (l) => { l.floors.first.rotation = -180; });
  await openAlign(page);
  await expect(page.locator("#alignRot")).toHaveValue("-180");
  const d0 = await depth(page);
  await page.locator("#alignRot").fill("-180");
  await page.locator("#alignRot").press("Enter");
  await page.locator("#alignRot").fill("180"); // the same angle, written the other way
  await page.locator("#alignRot").press("Enter");
  await page.locator("#alignX").fill("0");
  await page.locator("#alignX").press("Enter");
  expect((await poseOf(page)).rot).toBe(-180);
  expect(await depth(page)).toBe(d0);
});
