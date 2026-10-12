import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Layout, Pt } from "../../src/core/schema";
import { validate } from "../../src/core";
import { serve, ORIGIN, drawn } from "../card/helpers-3d";
import { FIRST_TO_GROUND, GROUND_TO_BASEMENT, type TruePlace } from "../fixtures/hand-align-truth";

// S30.9, the exit test of Sprint 30 (criterion 24). The hand-align house is stored with no pose. In the Studio, with real page.mouse
// clicks: Align on the ground, Apply; Align on the first floor, Apply; Save. The saved file validates; each floor's outline corners,
// placed in the house by the pose the file carries, lie within 2 cm of where the invented truth puts them, and the turn within 0.2
// degree. Then the card with `floors_below: solid` on the first floor: the ground's and the basement's stair footprints lie on the
// first floor's own stair within 2 cm, read from the 3D hook's bounds. Nothing here comes from src/core but `validate`: the expected
// corners are worked out from the fixture and hand-align-truth.ts.
const EDITOR = "floorplan-studio-editor";
const FIXTURE = JSON.parse(readFileSync("tests/fixtures/hand-align-house.json", "utf8"));
const rad = (d: number) => (d * Math.PI) / 180;
const turnBy = (v: number[], d: number): Pt => [v[0]! * Math.cos(rad(d)) - v[1]! * Math.sin(rad(d)), v[0]! * Math.sin(rad(d)) + v[1]! * Math.cos(rad(d))];
const place = (p: number[], t: TruePlace): Pt => { const r = turnBy(p, t.turn); return [r[0] + t.shift[0], r[1] + t.shift[1]]; };
const worst = (a: Pt[], b: Pt[]) => a.reduce((m, p, i) => Math.max(m, Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1])), 0);
/** A stair's four corners as drawn: the stored points turned by its `rot` about their centre. */
const footprint = (st: { pts: number[][]; rot: number }): Pt[] => {
  const c = [0, 1].map((k) => st.pts.reduce((a, q) => a + q[k]!, 0) / st.pts.length);
  return st.pts.map((q) => { const v = turnBy([q[0]! - c[0]!, q[1]! - c[1]!], st.rot); return [c[0]! + v[0], c[1]! + v[1]] as Pt; });
};
/** The outline of a saved floor in the house: its saved pose applied (the basement has none). */
const inHouse = (saved: Layout, floor: string): Pt[] => {
  const f = saved.floors[floor] as any;
  return f.outline.map((p: Pt) => place(p, { turn: f.rotation ?? 0, shift: f.offset ?? [0, 0] }));
};
const press = async (page: Page, sel: string) => {
  const b = page.locator(sel);
  await b.scrollIntoViewIfNeeded();
  const r = (await b.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
};

async function alignAndSave(page: Page): Promise<Layout> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/standalone.html");
  await expect(page.locator(`${EDITOR} svg polygon[data-r]`).first()).toBeVisible();
  await page.locator("#fixPlan").uncheck();
  await page.evaluate(([tag, x]) => { (document.querySelector(tag as string) as any).layout = x; }, [EDITOR, structuredClone(FIXTURE)] as const);
  for (const floor of ["ground", "first"]) {
    await page.locator(`.chip[data-f="${floor}"]`).click();
    await page.locator("#mFloors > summary").click();
    await page.locator("#alignFloor").click();
    await expect(page.locator("#alignPanel")).toBeVisible();
    await expect(page.locator("#alignScore")).toContainText("% match");
    await expect(page.locator("#alignApply")).toBeEnabled();
    await press(page, "#alignApply");
    await expect(page.locator("#status")).toHaveText(new RegExp(`^Aligned to ${floor === "ground" ? "Basement" : "Ground"}: \\d+ % match`));
    await expect(page.locator("#alignMove")).toHaveText("Already aligned");
    await page.keyboard.press("Escape");
    await expect(page.locator("#alignPanel")).toBeHidden();
  }
  await page.locator("details.menu > summary", { hasText: "File" }).click();
  const dl = page.waitForEvent("download");
  await press(page, "#save");
  const saved = JSON.parse(readFileSync(await (await dl).path(), "utf8")) as Layout;
  expect(validate(saved).ok, "the saved file validates").toBe(true);
  return saved;
}

interface Hook { belowSolids(): { kind: string; base: number[][] }[] }
const solids = (page: Page) => page.evaluate(`window.__fp3d.belowSolids()`) as Promise<ReturnType<Hook["belowSolids"]>>;
const belowCount = (page: Page) => page.evaluate(`window.__fp3d.below().count`) as Promise<number>;
async function bootCard(page: Page, layout: unknown, config: Record<string, unknown>) {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate((cfg) => {
    const el = document.getElementById("card") as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
    el.setConfig(cfg);
    el.hass = { states: {}, callService: () => undefined };
    return el.updateComplete;
  }, { layout, active_list: false, ...config });
}
const solidsAt = (all: { kind: string; base: number[][] }[], corners: number[][], tol: number) =>
  corners.map((c) => all.filter((x) => x.kind === "stair" && x.base.some((q) => Math.hypot(q[0]! - c[0]!, q[1]! - c[1]!) <= tol)).length);

test("Align and Apply on the ground and the first floor, Save: outlines within 2 cm and 0.2 degree of the truth", async ({ page }) => {
  const saved = await alignAndSave(page);
  const ground = saved.floors.ground as any, first = saved.floors.first as any;
  expect(Math.abs(ground.rotation - GROUND_TO_BASEMENT.turn), "ground turn").toBeLessThan(0.2);
  // The first floor is stored relative to the ground's frame by its own pose; in the house its turn is the sum.
  expect(Math.abs(first.rotation - (GROUND_TO_BASEMENT.turn + FIRST_TO_GROUND.turn)), "first turn in the house").toBeLessThan(0.2);
  expect(worst(inHouse(saved, "ground"), (FIXTURE.floors.ground.outline as Pt[]).map((p) => place(p, GROUND_TO_BASEMENT))), "ground corners").toBeLessThan(2);
  const firstTruth = (FIXTURE.floors.first.outline as Pt[]).map((p) => place(place(p, FIRST_TO_GROUND), GROUND_TO_BASEMENT));
  expect(worst(inHouse(saved, "first"), firstTruth), "first corners").toBeLessThan(2);
  // control: the unaligned fixture is far from the truth, so the check can fail
  expect(worst(FIXTURE.floors.first.outline as Pt[], firstTruth)).toBeGreaterThan(20);
});

test("the card with floors_below solid: the stairs of the floors below lie on the first floor's stair within 2 cm", async ({ page }) => {
  const saved = await alignAndSave(page);
  const ownFirst = footprint(FIXTURE.floors.first.stairs[0]);
  await bootCard(page, saved, { floor: "first", view: "3d", floors_below: "solid" });
  await drawn(page);
  await expect.poll(() => belowCount(page), { timeout: 8000 }).toBeGreaterThan(0);
  for (const [i, n] of solidsAt(await solids(page), ownFirst, 2).entries()) expect(n, `first: corner ${i} has stair blocks of both floors below within 2 cm`).toBeGreaterThanOrEqual(2);
  await bootCard(page, structuredClone(FIXTURE), { floor: "first", view: "3d", floors_below: "solid" });
  await drawn(page);
  await expect.poll(() => belowCount(page), { timeout: 8000 }).toBeGreaterThan(0);
  expect(solidsAt(await solids(page), ownFirst, 2).some((n) => n === 0), "an unaligned house misses by more than 2 cm").toBe(true);
});
