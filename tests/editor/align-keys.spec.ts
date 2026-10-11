import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Layout } from "../../src/core/schema";

// S29.10: the Align panel's keys (arrows move, `,` and `.` turn), the offset and rotation boxes, and Reset.
// Real page.keyboard (finding 3), keys heard on the editor host and not on window (finding 6), one press one undo step.
// Asymmetric values: a 50 cm / 3 degree choice and typed -2.25 and 3,5, never 90 degrees of rotation.

const EDITOR = "floorplan-studio-editor";
const FIXTURE = JSON.parse(readFileSync("tests/fixtures/hand-align-house.json", "utf8"));
const layoutOf = (page: Page) => page.evaluate((tag) => JSON.parse(JSON.stringify((document.querySelector(tag) as any).layout)) as Layout, EDITOR);
const poseOf = async (page: Page) => { const f = (await layoutOf(page)).floors.first as any; return { rot: f.rotation ?? 0, off: (f.offset ?? [0, 0]) as [number, number] }; };
const depth = (page: Page) => page.evaluate((tag) => (document.querySelector(tag) as any).st.hist.length as number, EDITOR);
const viewBox = (page: Page) => page.evaluate((tag) => (document.querySelector(tag) as any).shadowRoot.querySelector("svg").getAttribute("viewBox") as string, EDITOR);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/standalone.html");
  await expect(page.locator(`${EDITOR} svg polygon[data-r]`).first()).toBeVisible();
  await page.locator("#fixPlan").uncheck();
  await page.evaluate(([tag, l]) => { (document.querySelector(tag as string) as any).layout = l; }, [EDITOR, FIXTURE] as const);
  await page.locator('.chip[data-f="first"]').click();
});
const openAlign = async (page: Page) => { await page.locator("#mFloors > summary").click(); await page.locator("#alignFloor").click(); await expect(page.locator("#alignPanel")).toBeVisible(); };

test("each of the six keys is one step of the right size and sign, one undo step", async ({ page }) => {
  await openAlign(page);
  const cases: { key: string; off: [number, number]; rot: number }[] = [
    { key: "ArrowRight", off: [5, 0], rot: 0 }, { key: "ArrowLeft", off: [-5, 0], rot: 0 }, { key: "ArrowDown", off: [0, 5], rot: 0 }, { key: "ArrowUp", off: [0, -5], rot: 0 },
    { key: ".", off: [0, 0], rot: 0.5 }, { key: ",", off: [0, 0], rot: -0.5 },
  ];
  for (const c of cases) {
    const d0 = await depth(page), p0 = await poseOf(page);
    await page.keyboard.press(c.key);
    await expect.poll(async () => (await poseOf(page)).rot - p0.rot, { message: c.key }).toBeCloseTo(c.rot, 5);
    const p1 = await poseOf(page);
    if (c.rot === 0) { expect(p1.off[0] - p0.off[0], c.key).toBeCloseTo(c.off[0], 5); expect(p1.off[1] - p0.off[1], c.key).toBeCloseTo(c.off[1], 5); }
    expect(await depth(page), c.key).toBe(d0 + 1);
  }
});

test("the keys follow the selected steps, and a key at view turn 90 moves along the screen", async ({ page }) => {
  await page.locator("#vrotr").click(); await page.locator("#vrotr").click();
  await expect.poll(() => page.evaluate((tag) => (document.querySelector(tag) as any).st.turnDeg as number, EDITOR)).toBe(90);
  await openAlign(page);
  await page.locator('[data-step="50"]').click();
  await page.locator('[data-angle="3"]').click();
  await page.keyboard.press("ArrowRight"); // screen right is the floor's own up at a view turn of 90
  await expect.poll(async () => (await poseOf(page)).off[1]).toBe(-50);
  expect((await poseOf(page)).off[0]).toBeCloseTo(0, 5);
  await page.keyboard.press(".");
  await expect.poll(async () => (await poseOf(page)).rot).toBe(3);
});

test("a held key, press to release with auto-repeat, is one step", async ({ page }) => {
  await openAlign(page);
  const d0 = await depth(page);
  await page.keyboard.down("ArrowRight");
  for (let i = 0; i < 5; i++) await page.keyboard.down("ArrowRight"); // five auto-repeat events (repeat: true)
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => (await poseOf(page)).off[0]).toBe(5);
  expect(await depth(page)).toBe(d0 + 1);
  await page.keyboard.down(".");
  for (let i = 0; i < 5; i++) await page.keyboard.down(".");
  await page.keyboard.up(".");
  await expect.poll(async () => (await poseOf(page)).rot).toBe(0.5);
  expect(await depth(page)).toBe(d0 + 2);
});

test("a key typed in the offset box leaves the floor alone", async ({ page }) => {
  await openAlign(page);
  const d0 = await depth(page);
  await page.locator("#alignX").focus();
  for (const k of ["ArrowRight", "ArrowLeft", "ArrowDown", ",", "."]) await page.keyboard.press(k);
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
  expect(await depth(page)).toBe(d0);
});

test("a key heard on window and not on the editor does nothing", async ({ page }) => {
  await openAlign(page);
  const d0 = await depth(page);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(await depth(page)).toBe(d0);
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
});

test("outside Align the arrows pan and the layout stays as it was", async ({ page }) => {
  await page.locator(EDITOR).focus();
  const d0 = await depth(page), v0 = await viewBox(page), l0 = JSON.stringify(await layoutOf(page));
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => viewBox(page)).not.toBe(v0);
  expect(JSON.stringify(await layoutOf(page))).toBe(l0);
  expect(await depth(page)).toBe(d0);
  await page.keyboard.press(".");
  expect(JSON.stringify(await layoutOf(page))).toBe(l0);
});

test("inside Align the arrows do not pan", async ({ page }) => {
  await openAlign(page);
  const v0 = await viewBox(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await poseOf(page)).off[0]).toBe(5);
  expect(await viewBox(page)).toBe(v0);
});

test("the offset and rotation boxes take typed values, one undo step each; junk shows the value again", async ({ page }) => {
  await openAlign(page);
  const d0 = await depth(page);
  const type = async (id: string, text: string) => { await page.locator(id).fill(text); await page.locator(id).press("Enter"); };
  await type("#alignX", "3,5");
  expect((await poseOf(page)).off).toEqual([3.5, 0]);
  await type("#alignY", "-2.25");
  expect((await poseOf(page)).off).toEqual([3.5, -2.2]); // stored to 0.1 cm (-22.5 rounds toward zero here)
  await type("#alignRot", "-2.25");
  expect((await poseOf(page)).rot).toBe(-2.25);
  await type("#alignRot", "3,5");
  expect((await poseOf(page)).rot).toBe(3.5);
  expect(await depth(page)).toBe(d0 + 4);
  await type("#alignRot", "abc");
  await type("#alignX", "abc");
  expect(await depth(page)).toBe(d0 + 4);
  await expect(page.locator("#alignRot")).toHaveValue("3.5");
  await expect(page.locator("#alignX")).toHaveValue("3.5");
  await type("#alignRot", "3.5"); // unchanged: no step
  expect(await depth(page)).toBe(d0 + 4);
});

test("Reset zeroes the rotation and the offset in one undo step, and one Undo brings both back", async ({ page }) => {
  await openAlign(page);
  const d00 = await depth(page);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("."); await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await depth(page))).toBe(d00 + 3); // turning about the pivot also shifts the offset, so count steps
  const before = await poseOf(page), d0 = await depth(page);
  expect(before.rot).toBe(0.5);
  await page.locator("#alignReset").click();
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
  expect(await depth(page)).toBe(d0 + 1);
  expect((await layoutOf(page)).floors.first).not.toHaveProperty("rotation");
  await page.locator("#undo").click();
  expect(await poseOf(page)).toEqual(before);
  await expect(page.locator("#alignReset")).toBeEnabled();
});

test("Reset is enabled for a rotation alone", async ({ page }) => {
  await openAlign(page);
  await expect(page.locator("#alignReset")).toBeDisabled();
  await page.keyboard.press(".");
  await expect(page.locator("#alignReset")).toBeEnabled();
});

test("under Lock plan a key is refused, offers Unlock and writes nothing", async ({ page }) => {
  await page.locator("#fixPlan").check();
  await openAlign(page);
  const d0 = await depth(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".banner #bannerUnfix")).toHaveText("Unlock");
  await page.keyboard.press(".");
  expect(await depth(page)).toBe(d0);
  expect(await poseOf(page)).toEqual({ rot: 0, off: [0, 0] });
});

test("Help lists the Align keys, and Escape still closes Align", async ({ page }) => {
  await openAlign(page);
  await page.keyboard.press("?");
  await expect(page.locator("#panel")).toContainText("Align");
  await expect(page.locator("#panel")).toContainText("Turn the floor");
  await page.keyboard.press("Escape"); // closes Help first
  await page.keyboard.press("Escape");
  await expect(page.locator("#alignPanel")).toHaveCount(0);
});
