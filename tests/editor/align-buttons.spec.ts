import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Layout } from "../../src/core/schema";
import { FIRST_TO_GROUND } from "../fixtures/hand-align-truth";

// S29.9: the Align panel's six buttons (Move up, left, right, down; Turn anticlockwise, clockwise) and the two step
// choices. Real page.mouse at each button's centre (finding 3). Pose maths uses asymmetric values: a 50 cm / 3 degree
// choice and a 4.00 degree turn, never 90 degrees of rotation. The first floor is the one aligned.

const EDITOR = "floorplan-studio-editor";
const FIXTURE = JSON.parse(readFileSync("tests/fixtures/hand-align-house.json", "utf8"));
const layoutOf = (page: Page) => page.evaluate((tag) => JSON.parse(JSON.stringify((document.querySelector(tag) as any).layout)) as Layout, EDITOR);
const poseOf = async (page: Page) => { const f = (await layoutOf(page)).floors.first as any; return { rot: f.rotation ?? 0, off: (f.offset ?? [0, 0]) as [number, number] }; };
const depth = (page: Page) => page.evaluate((tag) => (document.querySelector(tag) as any).st.hist.length as number, EDITOR);

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

/** A real press at the middle of the button, after scrolling it into view. */
async function press(page: Page, sel: string) {
  const b = page.locator(sel);
  await b.scrollIntoViewIfNeeded();
  const r = (await b.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

/** Screen position of the first ghost point and of the first outline point of the floor itself, and of the pivot cross. */
const screen = (page: Page) => page.evaluate((tag) => {
  const root = (document.querySelector(tag) as any).shadowRoot as ShadowRoot;
  const at = (el: SVGGeometryElement | null) => {
    if (!el) return null;
    const svg = el.ownerSVGElement!, p = svg.createSVGPoint(), q = el instanceof SVGPolygonElement ? el.points.getItem(0) : el.getPointAtLength(0), m = el.getScreenCTM()!;
    p.x = q.x; p.y = q.y; const s = p.matrixTransform(m);
    return [s.x, s.y] as [number, number];
  };
  const pv = root.querySelector(".align-pivot")?.getBoundingClientRect();
  return { ghost: at(root.querySelector("g.ghost path.gl")), own: at(root.querySelector("svg polygon[data-r]") as any), pivot: pv ? [pv.x + pv.width / 2, pv.y + pv.height / 2] as [number, number] : null };
}, EDITOR);

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const MOVES = [
  { id: "#alignRight", screen: [1, 0] }, { id: "#alignLeft", screen: [-1, 0] }, { id: "#alignDown", screen: [0, 1] }, { id: "#alignUp", screen: [0, -1] },
] as const;

for (const turn of [0, 90]) {
  test.describe(`view turn ${turn}`, () => {
    test.beforeEach(async ({ page }) => {
      await setup(page);
      for (let i = 0; i < turn / 45; i++) await page.locator("#vrotr").click();
      await expect.poll(() => page.evaluate((tag) => (document.querySelector(tag) as any).st.turnDeg as number, EDITOR)).toBe(turn); // the turn has finished animating
      await openAlign(page);
    });

    test("each Move button moves this floor by the step along the screen direction, one undo step; the ghost moves the other way", async ({ page }) => {
      await press(page, '[data-step="50"]'); // an asymmetric choice, not the default
      for (const m of MOVES) {
        const d0 = await depth(page), p0 = await poseOf(page), s0 = await screen(page);
        await press(page, m.id);
        // the screen direction turned back by the view turn, in the floor's own frame (floor rotation 0 here)
        const a = (-turn * Math.PI) / 180, want: [number, number] = [50 * (m.screen[0] * Math.cos(a) - m.screen[1] * Math.sin(a)), 50 * (m.screen[0] * Math.sin(a) + m.screen[1] * Math.cos(a))];
        await expect.poll(async () => (await poseOf(page)).off[0] - p0.off[0], { message: m.id }).toBeCloseTo(want[0], 1);
        const p1 = await poseOf(page);
        expect(p1.off[1] - p0.off[1], m.id).toBeCloseTo(want[1], 1);
        expect(p1.rot).toBe(0);
        expect(await depth(page), m.id).toBe(d0 + 1);
        const s1 = await screen(page);
        // relative to the floor's own outline the ghost moves opposite to the direction pressed, 50 cm of plan on the screen
        const dx = s1.ghost![0] - s1.own![0] - (s0.ghost![0] - s0.own![0]), dy = s1.ghost![1] - s1.own![1] - (s0.ghost![1] - s0.own![1]);
        expect(dx * m.screen[0] + dy * m.screen[1], `${m.id} ghost against the press`).toBeLessThan(-5);
        expect(Math.abs(dx * m.screen[1] - dy * m.screen[0]), `${m.id} ghost across the press`).toBeLessThan(2);
      }
    });

    test("each Turn button turns this floor by the angle step about its pivot, one undo step, the pivot stays", async ({ page }) => {
      await press(page, '[data-angle="3"]');
      const pivot = await page.evaluate(([tag]) => { const l = (document.querySelector(tag as string) as any).layout.floors.first; const xs = l.outline.map((p: number[]) => p[0]), ys = l.outline.map((p: number[]) => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }, [EDITOR]);
      for (const [id, sign] of [["#alignTurnR", 1], ["#alignTurnL", -1]] as const) {
        const d0 = await depth(page), p0 = await poseOf(page);
        await press(page, id);
        await expect.poll(async () => (await poseOf(page)).rot - p0.rot, { message: id }).toBeCloseTo(3 * sign, 5);
        expect(await depth(page), id).toBe(d0 + 1);
        const p1 = await poseOf(page), house = (p: typeof p0) => { const a = (p.rot * Math.PI) / 180; return [pivot[0] * Math.cos(a) - pivot[1] * Math.sin(a) + p.off[0], pivot[0] * Math.sin(a) + pivot[1] * Math.cos(a) + p.off[1]]; };
        expect(Math.hypot(house(p1)[0] - house(p0)[0], house(p1)[1] - house(p0)[1]), `${id} pivot held`).toBeLessThan(0.15);
      }
      const s = await screen(page);
      expect(s.pivot, "the pivot cross is drawn").not.toBeNull();
    });
  });
}

test("a clockwise turn swings the ghost anticlockwise about the pivot on screen", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  await press(page, '[data-angle="3"]');
  const s0 = await screen(page);
  await press(page, "#alignTurnR");
  await expect.poll(async () => (await poseOf(page)).rot).toBe(3);
  const s1 = await screen(page);
  const v0 = [s0.ghost![0] - s0.pivot![0], s0.ghost![1] - s0.pivot![1]], v1 = [s1.ghost![0] - s0.pivot![0], s1.ghost![1] - s0.pivot![1]];
  const cross = v0[0] * v1[1] - v0[1] * v1[0]; // y points down: a negative cross is anticlockwise on screen
  expect(cross).toBeLessThan(0);
});

test("the step choice changes the next press and survives a reload; blocked storage gives the defaults", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  await expect(page.locator('[data-step="5"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-angle="0.5"]')).toHaveAttribute("aria-pressed", "true");
  await press(page, "#alignRight");
  await expect.poll(async () => (await poseOf(page)).off[0]).toBe(5);
  await press(page, '[data-step="1"]');
  await press(page, '[data-angle="0.1"]');
  await expect(page.locator('[data-step="1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-step="5"]')).toHaveAttribute("aria-pressed", "false");
  await press(page, "#alignRight");
  await expect.poll(async () => (await poseOf(page)).off[0]).toBe(6);
  await press(page, "#alignTurnR");
  await expect.poll(async () => (await poseOf(page)).rot).toBe(0.1);
  await page.reload();
  await expect(page.locator(`${EDITOR} svg polygon[data-r]`).first()).toBeVisible();
  await setup(page); // same origin: the storage is kept
  await openAlign(page);
  await expect(page.locator('[data-step="1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-angle="0.1"]')).toHaveAttribute("aria-pressed", "true");
});

test("blocked storage: defaults, a press still works, no error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
  });
  await setup(page);
  await openAlign(page);
  await expect(page.locator('[data-step="5"]')).toHaveAttribute("aria-pressed", "true");
  await press(page, '[data-step="50"]');
  await press(page, "#alignDown");
  await expect.poll(async () => (await poseOf(page)).off[1]).toBe(50);
  expect(errors).toEqual([]);
});

test("junk in storage gives the defaults", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("fp-align-steps", '{"move":7,"turn":"x"}'); } catch { /* none */ } });
  await setup(page);
  await openAlign(page);
  await expect(page.locator('[data-step="5"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-angle="0.5"]')).toHaveAttribute("aria-pressed", "true");
});

test("while Align is open no edit handle is drawn, and the pivot cross takes no pointer", async ({ page }) => {
  // a flat straight stair is drawn with a handle at each corner while Align is closed
  await setup(page, (l) => { const s = JSON.parse(JSON.stringify(l.floors.first.stairs[0])); s.id = "flat"; s.rot = 0; l.floors.first.stairs.push(s); });
  await expect(page.locator(`${EDITOR} svg circle.h`).first()).toBeAttached();
  await openAlign(page);
  await expect(page.locator(`${EDITOR} svg circle.h`)).toHaveCount(0);
  await expect(page.locator(`${EDITOR} svg .align-pivot`)).toHaveCount(1);
  const pe = await page.evaluate((tag) => getComputedStyle((document.querySelector(tag) as any).shadowRoot.querySelector(".align-pivot")).pointerEvents, EDITOR);
  expect(pe).toBe("none");
  await page.locator("#alignClose").click();
  await expect(page.locator(`${EDITOR} svg .align-pivot`)).toHaveCount(0);
  await expect(page.locator(`${EDITOR} svg circle.h`).first()).toBeAttached();
});

test("the selected step reads differently from the others (computed style), and every button names this floor", async ({ page }) => {
  await setup(page);
  await openAlign(page);
  const paint = (sel: string) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return `${c.backgroundColor}|${c.color}|${c.fontWeight}`; });
  expect(await paint('[data-step="5"]')).not.toBe(await paint('[data-step="1"]'));
  expect(await paint('[data-angle="0.5"]')).not.toBe(await paint('[data-angle="3"]'));
  await press(page, '[data-step="1"]');
  expect(await paint('[data-step="1"]')).not.toBe(await paint('[data-step="5"]'));
  for (const n of ["Move this floor up", "Move this floor left", "Move this floor right", "Move this floor down", "Turn this floor anticlockwise", "Turn this floor clockwise"]) await expect(page.getByRole("button", { name: n })).toHaveCount(1);
  await expect(page.locator("#alignPanel")).toContainText("This floor moves. The floor below (faint lines) is drawn moving the other way.");
});

test("a turned floor previews and applies with its turn kept (Apply goes through setPose)", async ({ page }) => {
  await setup(page, (l) => { l.floors.first.rotation = FIRST_TO_GROUND.turn; });
  await openAlign(page);
  const d0 = await depth(page);
  await expect(page.locator("#alignScore")).toBeVisible();
  await press(page, "#alignApply");
  const p = await poseOf(page);
  expect(p.rot).toBe(FIRST_TO_GROUND.turn);
  expect(close(p.off[0], FIRST_TO_GROUND.shift[0], 2) && close(p.off[1], FIRST_TO_GROUND.shift[1], 2), JSON.stringify(p)).toBe(true);
  expect(await depth(page)).toBe(d0 + 1);
  await expect(page.locator("#alignMove")).toHaveText("Already aligned");
});

test("lock plan refuses a button press and writes nothing", async ({ page }) => {
  await setup(page);
  await page.locator("#fixPlan").check();
  await openAlign(page);
  const d0 = await depth(page);
  await press(page, "#alignRight");
  await expect(page.locator(".banner #bannerUnfix")).toHaveText("Unlock");
  expect(await depth(page)).toBe(d0);
  expect((await poseOf(page)).off).toEqual([0, 0]);
});
