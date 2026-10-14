import { expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Shared by the 3D card specs: the built card served the way Home Assistant serves it, and a few locators.

export const demo = JSON.parse(readFileSync("demo/layout.json", "utf8"));
// dist-test/ is the card built with the 3D test hook (scripts/build.mjs, FP_TEST_BUILD=1); the shipped www/ has none. The files are the same otherwise.
export const WWW = resolve("dist-test");
export const ORIGIN = "http://fp.test";
const MIME: Record<string, string> = { ".js": "text/javascript", ".html": "text/html" };

/** Everything the page asked for, so a test can say what was and was not fetched. */
export async function serve(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("data:") && !r.url().startsWith("blob:")) seen.push(r.url()); });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort(); // a request to any other origin is recorded above, then refused
    if (url.pathname === "/harness.html") return route.fulfill({ body: readFileSync(resolve("tests/card/harness-static.html")), contentType: "text/html" });
    const m = /^\/floorplan_studio_static\/([\w.-]+)$/.exec(url.pathname);
    const file = m && resolve(WWW, m[1]);
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ body: readFileSync(file), contentType: MIME[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream" });
  });
  return seen;
}

export async function open(page: Page, config: Record<string, unknown> = { layout: structuredClone(demo), floor: "ground" }) {
  const seen = await serve(page);
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await configure(page, config);
  return seen;
}
export async function configure(page: Page, config: Record<string, unknown>) {
  await page.evaluate((config) => {
    const el = document.getElementById("card") as unknown as { setConfig(c: unknown): void; hass: unknown; updateComplete: Promise<unknown> };
    el.setConfig(config);
    el.hass = { states: {}, callService: () => undefined };
    return el.updateComplete;
  }, config);
}


export const card = (page: Page) => page.locator("floorplan-studio-card");
export const canvas = (page: Page) => card(page).locator("css=canvas");
export const holder = (page: Page) => card(page).locator("css=.fp-3d");
export const cam = (page: Page) => holder(page).evaluate((el) => ({ az: +el.dataset.az!, polar: +el.dataset.polar!, dist: +el.dataset.dist!, target: el.dataset.target!, drawn: +(el.dataset.drawn ?? 0) }));
/** Waits until the canvas has drawn at least `n` frames. */
export const drawn = (page: Page, n = 1) => expect.poll(async () => (await cam(page)).drawn, { timeout: 15000 }).toBeGreaterThanOrEqual(n);

// ---- S32.1: measuring a 3D framing on the screen (docs/specs/card-3d-framing.md, criteria 1 to 9). The house is never read back
// from the number the code set: the test hook projects the eight corners of the box through the real camera, and the visible
// box is read from the DOM and the card's own `--fp-sheet-*` stops.

export type Rect = { left: number; top: number; right: number; bottom: number };
type Fp3d = { box(which: "floor" | number): Rect | null; camera(): { az: number; polar: number; zoom: number; dx: number; dz: number } };

/** The box the framing frames, projected by the real camera (test build only): "floor", or a room's index. Null: no such box. */
export const box = (page: Page, which: "floor" | number) => page.evaluate((w) => (window as unknown as { __fp3d: Fp3d }).__fp3d.box(w), which);
/** The camera as the card would store it (az, polar, zoom as a multiple of the fit, pan). */
export const camState = (page: Page) => page.evaluate(() => (window as unknown as { __fp3d: Fp3d }).__fp3d.camera());

/**
 * The part of the stage the eye can see: the `.fp-3d` rect, less the bottom sheet's cover at its `data-stop`. The stop's height is
 * the card's own `--fp-sheet-peek|half|full` (px), the number, not the sheet's animated box, so a transition in flight does not
 * matter. Only the bottom frame covers; at peek the sheet has a grid row of its own, so the cover works out as 0 there.
 */
export function visibleBox(page: Page, nth = 0): Promise<Rect & { cover: number }> {
  return card(page).nth(nth).evaluate((host) => {
    const stage = host.shadowRoot!.querySelector(".fp-3d")!.getBoundingClientRect(), c = host.getBoundingClientRect();
    const sheet = host.shadowRoot!.querySelector<HTMLElement>(".fp-bottom");
    let cover = 0;
    if (sheet) {
      const stop = sheet.dataset.stop ?? "peek", h = parseFloat(host.style.getPropertyValue(`--fp-sheet-${stop}`));
      cover = Math.min(stage.height, Math.max(0, stage.bottom - (c.bottom - (Number.isFinite(h) ? h : 0))));
    }
    return { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom - cover, cover };
  });
}
/** `b` lies within `vis` by at least `margin` px on every side. */
export const inside = (b: Rect | null, vis: Rect, margin = 8) => !!b && b.left >= vis.left + margin && b.top >= vis.top + margin && b.right <= vis.right - margin && b.bottom <= vis.bottom - margin;
/** Inside, and at least `share` (85 %) of the visible box's width or of its height. */
export const fitted = (b: Rect | null, vis: Rect, share = 0.85) => inside(b, vis, 8) && (b!.right - b!.left >= share * (vis.right - vis.left) || b!.bottom - b!.top >= share * (vis.bottom - vis.top));
/** What an assertion message shows for a measured box and its visible box. */
export const why = (b: Rect | null, vis: Rect) => JSON.stringify({ box: b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)])), visible: Object.fromEntries(Object.entries(vis).map(([k, v]) => [k, Math.round(v)])) });

/** The camera is at rest: no glide (`data-easing` absent), `data-drawn` the same over two animation frames, and the stage the same size. */
export async function settled(page: Page, timeout = 15000) {
  const read = async () => ({ ease: await holder(page).getAttribute("data-easing"), drawn: (await cam(page)).drawn, stage: JSON.stringify(await holder(page).boundingBox()) });
  await expect.poll(async () => {
    const a = await read();
    if (a.ease !== null) return false;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const b = await read();
    return b.ease === null && b.drawn === a.drawn && b.stage === a.stage;
  }, { timeout }).toBe(true);
}
