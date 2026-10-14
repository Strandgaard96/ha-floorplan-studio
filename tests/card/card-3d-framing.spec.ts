import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, configure, card, canvas, holder, cam, drawn, box, camState, visibleBox, fitted, why, settled } from "./helpers-3d";

// S32.1 (docs/specs/card-3d-framing.md, criteria 1 to 9): where the 3D camera frames the house. The house is measured on the screen:
// the test hook (`__fp3d.box`, dist-test only) projects the eight corners of the box through the real camera, and the visible box
// is read from the DOM (the `.fp-3d` rect less the bottom sheet's cover at its `data-stop`, from the card's `--fp-sheet-*`).
// Real `page.mouse` at real coordinates throughout (CLAUDE.md finding 3); no `waitForTimeout`, waits are on `data-easing`,
// `data-drawn` and the stage's own rect. Where the next step has no state to wait on (the double-tap window, 350 ms, that a canvas
// tap waits out before it moves the camera) the wait is on the page's own clock, as `card-bottom-sheet.spec.ts` waits on frames.
//
// Red by design: every case that fails against 0.29.0 carries `red(n)`, `test.fail()` with "S32.n removes this", n the task that
// makes it pass. Each fails on an assertion (not fitted, outside, camera unchanged, no glide seen), never on a timeout.
// Cases that already pass are not marked; the report names them.

const red = (n: number, on = true) => test.fail(on, `S32.${n} removes this`);

type Size = readonly [number, number];
const SIZES: readonly Size[] = [[768, 1024], [1024, 768], [390, 844], [844, 390]];
const PHONE: Size = [390, 844], WIDE: Size = [1024, 768];
const name = (s: Size) => `${s[0]}x${s[1]}`;

const GROUND = demo.floors.ground;
const KITCHEN: number = GROUND.rooms.findIndex((r: { name: string }) => r.name === "Kitchen");
const centreOf = (room: { pts: [number, number][] }) => [room.pts.reduce((a, q) => a + q[0], 0) / room.pts.length, room.pts.reduce((a, q) => a + q[1], 0) / room.pts.length] as const;

// ---- the card at a size ----------------------------------------------------------------------------------------------------------

async function fit(page: Page, size: Size) {
  await page.evaluate(([w]) => { document.body.style.margin = "0"; (document.getElementById("wrap") as HTMLElement).style.width = `${w}px`; }, size);
}
/** The demo house in 3D at `size`, drawn and at rest. The card is told its width before its config, so the first draw is at that size. */
async function boot(page: Page, size: Size, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width: size[0], height: size[1] });
  await serve(page);
  await page.goto(`${ORIGIN}/harness.html`);
  await fit(page, size);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await configure(page, { layout: structuredClone(demo), floor: "ground", view: "3d", ...extra });
  await drawn(page);
  await settled(page);
}
const stage = async (page: Page) => JSON.stringify(await holder(page).boundingBox());
/** Resizes the window and the card's wrap, waits for the stage to change, then for the camera to rest. */
async function resize(page: Page, size: Size) {
  const before = await stage(page);
  await page.setViewportSize({ width: size[0], height: size[1] });
  await fit(page, size);
  await expect.poll(() => stage(page), { timeout: 10000 }).not.toBe(before);
  await settled(page);
}
const frames = (page: Page, n = 2) => page.evaluate((n) => new Promise<void>((done) => { let k = 0; const f = () => (++k >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const now = (page: Page) => page.evaluate(() => performance.now());
/** Waits until the page's own clock is `ms` past `t0`: the double-tap window (350 ms) closing is time passing, not a state to poll. */
const after = (page: Page, t0: number, ms: number) => page.evaluate(([t0, ms]) => new Promise<void>((done) => { const f = () => (performance.now() - t0 >= ms ? done() : requestAnimationFrame(f)); f(); }), [t0, ms]);
const ring = (page: Page) => holder(page).getAttribute("data-ring");

type Cam = Awaited<ReturnType<typeof cam>>;
const target = (c: Cam) => c.target.split(",").map(Number) as [number, number];
const sameCam = (a: Cam, b: Cam) => { expect(a.az).toBeCloseTo(b.az, 4); expect(a.polar).toBeCloseTo(b.polar, 4); expect(Math.abs(a.dist / b.dist - 1), "distance").toBeLessThan(0.01); const [ax, az] = target(a), [bx, bz] = target(b); expect(Math.abs(ax - bx), "target x").toBeLessThan(1); expect(Math.abs(az - bz), "target z").toBeLessThan(1); };

/** The floor's box is fitted in what the eye can see. */
async function expectFloorFitted(page: Page, what = "the house") {
  const vis = await visibleBox(page), b = await box(page, "floor");
  expect(fitted(b, vis), `${what} is fitted in the visible box ${why(b, vis)}`).toBe(true);
}
async function expectRoomFitted(page: Page, room: number, what = "the room") {
  const vis = await visibleBox(page), b = await box(page, room);
  expect(fitted(b, vis), `${what} is fitted in the visible box ${why(b, vis)}`).toBe(true);
}

// ---- driving the page -------------------------------------------------------------------------------------------------------------

const proj = (page: Page, x: number, y: number, z: number) => page.evaluate(([x, y, z]) => (window as unknown as { __fp3d: { project(x: number, y: number, z: number): { x: number; y: number } } }).__fp3d.project(x, y, z), [x, y, z] as const);
const picks = (page: Page, p: { x: number; y: number }) => page.evaluate((p) => (window as unknown as { __fp3d: { pick(x: number, y: number): unknown } }).__fp3d.pick(p.x, p.y), p);
const floorOf = async (page: Page, room: number) => { const [cx, cy] = centreOf(GROUND.rooms[room]); return proj(page, cx, cy, 1); };

/** The camera never moves for a room under a tap before the double-tap window closes: the tap is a real click on the Kitchen's floor, and the wait is the page's clock. */
async function tapKitchen(page: Page) {
  await settled(page);
  const p = await floorOf(page, KITCHEN);
  expect(await picks(page, p), `what the view finds at ${Math.round(p.x)},${Math.round(p.y)}`).toEqual({ type: "room", index: KITCHEN });
  const t0 = await now(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => ring(page)).toBe(String(KITCHEN));
  await after(page, t0, 450);
}
/** The header's Search, the letters, and a real click on the Kitchen room's result. */
async function searchKitchen(page: Page) {
  await settled(page);
  await card(page).getByRole("button", { name: "Search" }).click();
  await page.keyboard.type("Kitchen");
  const opt = card(page).locator("css=fp-search").locator("css=[role=\"option\"]").filter({ has: page.locator("css=.name", { hasText: /^Kitchen$/ }) });
  const t0 = await now(page);
  await opt.first().click();
  await expect.poll(() => ring(page)).toBe(String(KITCHEN));
  await after(page, t0, 150);
}
type How = "tap" | "search";
const HOWS: readonly How[] = ["tap", "search"];
const focusKitchen = (page: Page, how: How) => (how === "tap" ? tapKitchen(page) : searchKitchen(page));

/** A left drag on the canvas (orbit), at real coordinates, from the middle of the visible box. */
async function orbitDrag(page: Page, dx: number, dy = 0) {
  const v = await visibleBox(page), x = (v.left + v.right) / 2, y = (v.top + v.bottom) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await frames(page);
}
/** Hover the plan so the card owns the keyboard, then Escape. */
async function escape(page: Page) {
  const v = await visibleBox(page);
  await page.mouse.move((v.left + v.right) / 2, (v.top + v.bottom) / 2);
  await page.keyboard.press("Escape");
}
const handle = (page: Page) => card(page).locator("css=.fp-bottom .fp-handle");

// ---- criterion 1: first draw -----------------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 1: the first draw fits the house", () => {
  for (const size of SIZES) for (const rotation of [0, 45]) {
    test(`${name(size)}, plan turned ${rotation} degrees`, async ({ page }) => {
      // Measured against 0.29.0 (the sphere fit). Which sizes already pass is in the report; the ones that do not are marked.
      red(5, RED_FIRST.has(`${name(size)}/${rotation}`));
      await boot(page, size, { rotation });
      await expectFloorFitted(page);
    });
  }
});
// S32.4: the orbit frames a box exactly (fitBox), so five of these eight now pass through the view's px-cover bridge. Three still fail:
// fitBox centres the box's own centre, but a view from 50 degrees up draws the near side larger, so the corners' extent is not
// centred on it; the tight side is tight and the opposite side keeps slack, and the share of the visible box falls to 79-81 %,
// under the 85 % of "fitted". Left marked for the coordinator (a fitBox or a criterion call, not the orbit's).
const RED_FIRST = new Set<string>(["1024x768/45", "844x390/0", "844x390/45"]);

// ---- criterion 2: a resize re-fits a camera nobody has moved ---------------------------------------------------------------------

test.describe("S32.1 criterion 2: a resize re-fits the house", () => {
  const PAIRS: readonly (readonly [Size, Size])[] = [[[1024, 768], [768, 1024]], [[768, 1024], [1024, 768]], [[390, 844], [844, 390]], [[844, 390], [390, 844]], [[390, 844], [360, 844]]];
  for (const [from, to] of PAIRS) {
    test(`${name(from)} to ${name(to)}`, async ({ page }) => {
      red(5, to[0] === 844); // 844x390 is one of the three sizes whose fit stays under 85 % (see RED_FIRST)
      await boot(page, from);
      await resize(page, to);
      await expectFloorFitted(page);
    });
  }
  test("1024x768: the side sheet folded and opened (a real click on its button)", async ({ page }) => {
    await boot(page, WIDE);
    const before = await stage(page);
    await card(page).getByRole("button", { name: "Fold overview" }).click();
    await expect.poll(() => stage(page)).not.toBe(before);
    await settled(page);
    await expectFloorFitted(page, "the house after the sheet folded");
    const folded = await stage(page);
    await card(page).getByRole("button", { name: "Open overview" }).click();
    await expect.poll(() => stage(page)).not.toBe(folded);
    await settled(page);
    await expectFloorFitted(page, "the house after the sheet opened");
  });
});

// ---- criterion 3: a resize keeps a camera the person has moved -------------------------------------------------------------------

test.describe("S32.1 criterion 3: a resize does not snap a moved camera", () => {
  /** The house's width over the visible width, from the hook's box. */
  const share = async (page: Page) => { const b = (await box(page, "floor"))!, v = await visibleBox(page); return (b.right - b.left) / (v.right - v.left); };
  async function moved(page: Page) {
    const v = await visibleBox(page), x = (v.left + v.right) / 2, y = (v.top + v.bottom) / 2;
    await orbitDrag(page, 120);
    await page.mouse.move(x, y);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
    await frames(page, 3);
    await settled(page);
  }
  for (const to of [[768, 1024], [390, 844]] as const) {
    test(`1024x768 to ${name(to)}: angles, target and zoom stay, the house keeps its share of the visible width`, async ({ page }) => {
      // 1024x768 to 768x1024 is the spec's pair; the stage is 704 px wide at the one and 716 at the other, so a camera that never
      // follows the box still keeps its width share within 3 % (red(5, false)): the phone pair, 704 to 390, is the one that tells.
      await boot(page, WIDE);
      await moved(page);
      const a = await cam(page), z = (await camState(page)).zoom, s = await share(page);
      await resize(page, to);
      const b = await cam(page);
      expect(b.az).toBeCloseTo(a.az, 4);
      expect(b.polar).toBeCloseTo(a.polar, 4);
      expect((await camState(page)).zoom).toBeCloseTo(z, 3);
      expect(b.target).toBe(a.target);
      expect(Math.abs((await share(page)) / s - 1), "the house's width over the visible width").toBeLessThan(0.03);
    });
  }
});

// ---- criterion 4: the bottom sheet ---------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 4: the house above the bottom sheet", () => {
  /** Handle to a stop: down, ten moves to `toY`, a rest, up (as card-bottom-sheet.spec.ts: a rest is not a fling). */
  async function dragHandle(page: Page, toY: number) {
    const b = (await handle(page).boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + ((toY - y) * i) / 10);
    await frames(page, 10);
    await page.mouse.up();
  }
  test("390x844: a tap on the handle (half) frames the house above the sheet", async ({ page }) => {
    red(6);
    await boot(page, PHONE);
    await handle(page).click();
    await expect(card(page).locator("css=.fp-bottom")).toHaveAttribute("data-stop", "half");
    await settled(page);
    const vis = await visibleBox(page);
    expect(vis.cover, "the sheet covers the lower part of the stage at half").toBeGreaterThan(100);
    await expectFloorFitted(page, "the house above the half sheet");
  });
  test("390x844: half, then full leaves the camera alone, then back to peek frames the whole stage, as the first draw did", async ({ page }) => {
    red(6);
    await boot(page, PHONE);
    const first = (await box(page, "floor"))!;
    await handle(page).click();
    await expect(card(page).locator("css=.fp-bottom")).toHaveAttribute("data-stop", "half");
    await settled(page);
    await expectFloorFitted(page, "the house above the half sheet");
    const half = await cam(page);
    const hb = (await handle(page).boundingBox())!;
    await dragHandle(page, hb.y + hb.height / 2 - 240);
    await expect(card(page).locator("css=.fp-bottom")).toHaveAttribute("data-stop", "full");
    await settled(page);
    sameCam(await cam(page), half);
    await handle(page).click(); // full goes to half
    await handle(page).click(); // half goes to peek
    await expect(card(page).locator("css=.fp-bottom")).toHaveAttribute("data-stop", "peek");
    await settled(page);
    const back = (await box(page, "floor"))!;
    for (const k of ["left", "top", "right", "bottom"] as const) expect(Math.abs(back[k] - first[k]), `${k} against the first draw`).toBeLessThan(2);
  });
  test("390x844, reduced motion: the camera goes from one framing to the other with no frame between", async ({ page }) => {
    red(6);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await boot(page, PHONE);
    await holder(page).evaluate((el) => {
      const w = window as unknown as { __seen: string[] };
      const read = () => `${el.dataset.dist}|${el.dataset.target}`;
      w.__seen = [read()];
      new MutationObserver(() => { const v = read(); if (w.__seen[w.__seen.length - 1] !== v) w.__seen.push(v); }).observe(el, { attributes: true, attributeFilter: ["data-dist", "data-target"] });
    });
    await handle(page).click();
    await expect(card(page).locator("css=.fp-bottom")).toHaveAttribute("data-stop", "half");
    await settled(page);
    await expectFloorFitted(page, "the house above the half sheet");
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen.length, `the camera values seen: ${seen.join(" ; ")}`).toBe(2);
  });
});

// ---- criterion 5: room focus -----------------------------------------------------------------------------------------------------

// The spec also names "its row": the sheet has no row that picks a room (rows are devices, and a device does not move the camera,
// Q4), so the paths are a tap on the room's floor and its Search result. The report says so.
test.describe("S32.1 criterion 5: a room pick frames the room", () => {
  for (const size of SIZES) for (const how of HOWS) {
    test(`${name(size)}, by ${how}`, async ({ page }) => {
      red(7);
      await boot(page, size);
      const pre = await cam(page);
      await focusKitchen(page, how);
      await settled(page);
      await expectRoomFitted(page, KITCHEN, "the Kitchen");
      const post = await cam(page);
      expect(post.az).toBeCloseTo(pre.az, 4);
      expect(post.polar).toBeCloseTo(pre.polar, 4);
      // The picture is what the pick sees: the room's projected centre picks the Kitchen, and a real click there lets it go again.
      const p = await floorOf(page, KITCHEN);
      expect(await picks(page, p), "what the view finds at the Kitchen's projected centre").toEqual({ type: "room", index: KITCHEN });
      await page.mouse.click(p.x, p.y);
      await expect.poll(() => ring(page)).toBe("");
    });
  }
});

// ---- criterion 6: unfocus --------------------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 6: leaving the room goes back to the camera it had", () => {
  const WAYS = ["Escape", "Back", "a tap on the background"] as const;
  for (const size of SIZES) for (const way of WAYS) {
    test(`${name(size)}, ${way}`, async ({ page }) => {
      red(7);
      await boot(page, size);
      const pre = await cam(page);
      await focusKitchen(page, "search");
      await settled(page);
      await expectRoomFitted(page, KITCHEN, "the Kitchen (the camera is focused before it is left)");
      if (way === "Escape") await escape(page);
      else if (way === "Back") await card(page).getByRole("button", { name: "Back" }).click();
      else {
        const c = (await canvas(page).boundingBox())!, x = c.x + 6, y = c.y + 6;
        const hit = (await picks(page, { x, y })) as { type?: string } | null;
        expect(hit?.type, "the canvas corner is no room").not.toBe("room");
        const t0 = await now(page);
        await page.mouse.click(x, y);
        await after(page, t0, 450);
      }
      await expect.poll(() => ring(page)).toBe("");
      await settled(page);
      sameCam(await cam(page), pre);
    });
  }
  test("1024x768: a floor tab drops the focus and frames the new floor", async ({ page }) => {
    red(7);
    await boot(page, WIDE, { floor: "all" });
    await focusKitchen(page, "search");
    await settled(page);
    await expectRoomFitted(page, KITCHEN, "the Kitchen");
    await card(page).locator("css=.fp-floors button", { hasText: "First" }).click();
    await expect(card(page).locator("css=.fp-floors button", { hasText: "First" })).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    expect(await ring(page)).toBe("");
    await expectFloorFitted(page, "the First floor");
  });
});

// ---- criterion 7: motion ----------------------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 7: the glide", () => {
  for (const size of SIZES) {
    test(`${name(size)}: a glide draws at least three frames`, async ({ page }) => {
      red(7);
      await boot(page, size);
      await holder(page).evaluate((el) => {
        const w = window as unknown as { __ease: { began: number | null; ended: number | null } };
        w.__ease = { began: null, ended: null };
        new MutationObserver(() => {
          const on = el.dataset.easing !== undefined, d = +(el.dataset.drawn ?? 0);
          if (on && w.__ease.began === null) w.__ease.began = d;
          if (!on && w.__ease.began !== null && w.__ease.ended === null) w.__ease.ended = d;
        }).observe(el, { attributes: true, attributeFilter: ["data-easing", "data-drawn"] });
      });
      await searchKitchen(page);
      await settled(page);
      const e = await page.evaluate(() => (window as unknown as { __ease: { began: number | null; ended: number | null } }).__ease);
      expect(e.began, "data-easing appeared").not.toBeNull();
      expect(e.ended! - e.began!, `frames drawn while easing ${JSON.stringify(e)}`).toBeGreaterThanOrEqual(3);
    });
    test(`${name(size)}, reduced motion: the room is framed with no frame between`, async ({ page }) => {
      red(7);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await boot(page, size);
      await holder(page).evaluate((el) => {
        const w = window as unknown as { __seen: string[] };
        const read = () => `${el.dataset.dist}|${el.dataset.target}`;
        w.__seen = [read()];
        new MutationObserver(() => { const v = read(); if (w.__seen[w.__seen.length - 1] !== v) w.__seen.push(v); }).observe(el, { attributes: true, attributeFilter: ["data-dist", "data-target"] });
      });
      await searchKitchen(page);
      await settled(page);
      await expectRoomFitted(page, KITCHEN, "the Kitchen");
      const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
      expect(seen.length, `the camera values seen: ${seen.join(" ; ")}`).toBe(2);
    });
  }
  for (const size of [WIDE, PHONE]) {
    test(`${name(size)}: a double tap on a room moves the camera not at all`, async ({ page }) => {
      // Passes against 0.29.0 (nothing moves the camera at all): a guard for S32.7's delay, not a red case.
      await boot(page, size);
      const pre = await cam(page);
      const p = await floorOf(page, KITCHEN);
      expect(await picks(page, p)).toEqual({ type: "room", index: KITCHEN });
      const t0 = await now(page);
      await page.mouse.dblclick(p.x, p.y);
      await after(page, t0, 700);
      await settled(page);
      sameCam(await cam(page), pre);
    });
    test(`${name(size)}: a real drag during the glide ends it`, async ({ page }) => {
      red(7);
      await boot(page, size);
      await card(page).getByRole("button", { name: "Search" }).click();
      await page.keyboard.type("Kitchen");
      const opt = card(page).locator("css=fp-search").locator("css=[role=\"option\"]").filter({ has: page.locator("css=.name", { hasText: /^Kitchen$/ }) });
      await opt.first().click();
      await expect.poll(() => holder(page).getAttribute("data-easing"), { timeout: 3000, message: "the glide shows data-easing" }).not.toBeNull();
      const v = await visibleBox(page), x = (v.left + v.right) / 2, y = v.top + 40;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const mid = await cam(page);
      expect(await holder(page).getAttribute("data-easing"), "a pointer down on the canvas stops the glide").toBeNull();
      await page.mouse.move(x + 30, y, { steps: 6 });
      await page.mouse.up();
      await frames(page, 6);
      await settled(page);
      const end = await cam(page);
      expect(end.dist, "no frame after the drag moves the camera's distance").toBe(mid.dist);
      expect(end.target, "nor its target").toBe(mid.target);
    });
  }
});

// ---- criterion 8: memory ---------------------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 8: the focus is never stored", () => {
  const stored = (page: Page) => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("fp-view:")).map(([, v]) => JSON.parse(v) as { floors?: [string, { cam?: unknown }][] }));
  test("1024x768: focus, orbit 60 px, reload: the orbit's angles, the zoom from before the focus", async ({ page }) => {
    red(7);
    await boot(page, WIDE);
    const zoom = (await camState(page)).zoom;
    await focusKitchen(page, "search");
    await settled(page);
    await expectRoomFitted(page, KITCHEN, "the Kitchen");
    await orbitDrag(page, 60);
    await settled(page);
    const turned = await cam(page);
    await expect.poll(async () => !!(await stored(page))[0]?.floors?.find(([k]) => k === "ground")?.[1].cam, { timeout: 5000 }).toBe(true);
    await page.reload();
    await fit(page, WIDE);
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    await configure(page, { layout: structuredClone(demo), floor: "ground", view: "3d" });
    await drawn(page);
    await settled(page);
    const back = await cam(page);
    expect(back.az).toBeCloseTo(turned.az, 3);
    expect(back.polar).toBeCloseTo(turned.polar, 3);
    expect((await camState(page)).zoom, "the pre-focus zoom, not the Kitchen's").toBeCloseTo(zoom, 3);
  });
  test("1024x768: Reset camera while focused goes to the first view, drops the focus, keeps the ring", async ({ page }) => {
    red(7);
    await boot(page, WIDE);
    const first = await cam(page);
    await focusKitchen(page, "search");
    await settled(page);
    await expectRoomFitted(page, KITCHEN, "the Kitchen");
    await card(page).locator("css=button[aria-label=\"Reset camera\"]").click();
    await settled(page);
    sameCam(await cam(page), first);
    expect(await ring(page), "the room stays picked").toBe(String(KITCHEN));
    await expectFloorFitted(page, "the house");
  });
});

// ---- criterion 9: hostile ---------------------------------------------------------------------------------------------------------

test.describe("S32.1 criterion 9: hostile cases", () => {
  test("two cards on one page: a pick in one moves only its camera", async ({ page }) => {
    red(7);
    await page.setViewportSize({ width: 1100, height: 800 });
    await serve(page);
    await page.goto(`${ORIGIN}/harness.html`);
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    const setup = (layout: unknown, id: string) => page.evaluate(([layout, id]) => {
      const c = document.getElementById(id as string) as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
      c.setConfig({ layout: structuredClone(layout), floor: "ground", view: "3d" });
      c.hass = { states: {}, callService: () => undefined };
      return c.updateComplete;
    }, [layout, id] as const);
    const hold = (n: number) => card(page).nth(n).locator("css=.fp-3d");
    const camN = (n: number) => hold(n).evaluate((el) => `${el.dataset.az}|${el.dataset.polar}|${el.dataset.dist}|${el.dataset.target}`);
    const hasDrawn = (n: number) => expect.poll(async () => +((await hold(n).getAttribute("data-drawn")) ?? 0), { timeout: 15000 }).toBeGreaterThan(0);
    // The first card is drawn before the second exists: the test hook (`__fp3d`) is the last card's, so the tap is aimed at the second.
    await page.evaluate(() => { document.body.style.cssText = "margin:0;display:flex"; (document.getElementById("wrap") as HTMLElement).style.width = "540px"; });
    await setup(demo, "card");
    await hasDrawn(0);
    await page.evaluate(() => {
      const b = (document.getElementById("wrap") as HTMLElement).cloneNode(false) as HTMLElement, el = document.createElement("floorplan-studio-card");
      b.id = "wrap2"; el.id = "card2"; b.append(el); document.body.append(b);
    });
    await setup(demo, "card2");
    await hasDrawn(1);
    const rest = async () => { await frames(page, 6); await expect.poll(async () => (await hold(0).getAttribute("data-easing")) === null && (await hold(1).getAttribute("data-easing")) === null).toBe(true); };
    await rest();
    const a0 = await camN(0), b0 = await camN(1);
    // The test hook is the last card's: the second card is the one a tap is aimed at.
    const p = await floorOf(page, KITCHEN);
    const t0 = await now(page);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => card(page).nth(1).locator("css=.fp-3d").getAttribute("data-ring")).toBe(String(KITCHEN));
    await after(page, t0, 450);
    await rest();
    expect(await camN(0), "the other card's camera").toBe(a0);
    const vis = await visibleBox(page, 1), b = await box(page, KITCHEN);
    expect(await camN(1), "the picked card's camera moved").not.toBe(b0);
    expect(fitted(b, vis), `the Kitchen in the second card ${why(b, vis)}`).toBe(true);
  });

  test("1024x768: a hass update mid-glide changes nothing; the glide ends where it would have", async ({ page }) => {
    red(7);
    await boot(page, WIDE);
    await searchKitchen(page);
    await settled(page);
    await expectRoomFitted(page, KITCHEN, "the Kitchen");
    const plain = await cam(page);
    await card(page).getByRole("button", { name: "Back" }).click();
    await settled(page);
    await searchKitchen(page);
    await expect.poll(() => holder(page).getAttribute("data-easing"), { timeout: 3000, message: "the glide shows data-easing" }).not.toBeNull();
    await page.evaluate(() => {
      const el = document.getElementById("card") as unknown as { hass: unknown };
      el.hass = { states: { "light.demo_kitchen": { state: "on", attributes: {}, last_changed: "2026-10-14T09:30:15Z" } }, callService: () => undefined };
    });
    await settled(page);
    sameCam(await cam(page), plain);
  });

  test("1024x768: a floor switch mid-glide frames the new floor", async ({ page }) => {
    red(7);
    await boot(page, WIDE, { floor: "all" });
    await searchKitchen(page);
    await expect.poll(() => holder(page).getAttribute("data-easing"), { timeout: 3000, message: "the glide shows data-easing" }).not.toBeNull();
    await card(page).locator("css=.fp-floors button", { hasText: "First" }).click();
    await expect(card(page).locator("css=.fp-floors button", { hasText: "First" })).toHaveAttribute("aria-pressed", "true");
    await settled(page);
    await expectFloorFitted(page, "the First floor");
  });

  test("1024x768: a room named __proto__ is framed like any other", async ({ page }) => {
    red(7);
    const layout = structuredClone(demo);
    layout.floors.ground.rooms[KITCHEN].name = "__proto__";
    await page.setViewportSize({ width: WIDE[0], height: WIDE[1] });
    await serve(page);
    await page.goto(`${ORIGIN}/harness.html`);
    await fit(page, WIDE);
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    await configure(page, { layout, floor: "ground", view: "3d" });
    await drawn(page);
    await tapKitchen(page);
    await settled(page);
    await expectRoomFitted(page, KITCHEN, "the room named __proto__");
  });

  test("1024x768: a one-room layout frames its room", async ({ page }) => {
    red(7);
    const layout = structuredClone(demo);
    layout.floors.ground.rooms = [layout.floors.ground.rooms[KITCHEN]];
    await page.setViewportSize({ width: WIDE[0], height: WIDE[1] });
    await serve(page);
    await page.goto(`${ORIGIN}/harness.html`);
    await fit(page, WIDE);
    await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
    await configure(page, { layout, floor: "ground", view: "3d" });
    await drawn(page);
    await settled(page);
    const [cx, cy] = centreOf(layout.floors.ground.rooms[0]);
    const p = await proj(page, cx, cy, 1);
    expect(await picks(page, p), "what the view finds at the room's centre").toEqual({ type: "room", index: 0 });
    const t0 = await now(page);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => ring(page)).toBe("0");
    await after(page, t0, 450);
    await settled(page);
    await expectRoomFitted(page, 0, "the only room");
  });

  test("1024x768: a room of 2 points and a room with NaN corners: no throw, the camera stays", async ({ page }) => {
    // Passes against 0.29.0 (a pick moves nothing): a guard for S32.7. The bad floor reaches the view through the test hook's
    // `setFloor` (what the card's own check would have refused); the card is then asked to pick a room by its index.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page, WIDE);
    await page.evaluate((floor) => {
      const f = structuredClone(floor);
      f.rooms[1].pts = [[500, 0], [800, 0]];
      f.rooms[2].pts[0] = [NaN, 0];
      (window as unknown as { __fp3d: { setFloor(f: unknown): void } }).__fp3d.setFloor(f);
    }, GROUND);
    await drawn(page, 2);
    await settled(page);
    const pre = await cam(page);
    for (const i of [1, 2]) {
      await page.evaluate((i) => (document.getElementById("card") as unknown as { _pickRoom(i: number): void })._pickRoom(i), i);
      await after(page, await now(page), 500);
      await settled(page);
      sameCam(await cam(page), pre);
      expect(await box(page, i), `no box for the bad room ${i}`).toBeNull();
    }
    expect(errors).toEqual([]);
  });
});
