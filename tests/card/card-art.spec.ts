import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, card, holder, drawn } from "./helpers-3d";

// S29 (A1-A7, AC 6-9): cover art in the built card, 2D and 3D, served as Home Assistant serves it. The image proxy is a route
// here: `cache=ok…` answers an SVG cover, anything else 404. Every request the page makes is recorded by `serve` (helpers-3d.ts).
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#c33"/></svg>`;
const href = (cache: string) => `/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=${cache}`;
const SPK = 12;
const layout = () => {
  const l = structuredClone(demo);
  l.floors.ground.devices.push({
    id: "spk",
    type: "speaker",
    entity: "media_player.kitchen",
    name: "Kitchen speaker",
    x: 700,
    y: 300,
  });
  return l;
};
const speaker = (state: string, attributes: Record<string, unknown>) => ({
  "media_player.kitchen": { state, attributes, last_changed: new Date().toISOString() },
});
async function boot(page: Page, view: "2d" | "3d", s: Record<string, unknown>) {
  const seen = await serve(page);
  await page.route(`${ORIGIN}/api/media_player_proxy/**`, (r) =>
    new URL(r.request().url()).searchParams.get("cache")?.startsWith("ok")
      ? r.fulfill({ body: COVER, contentType: "image/svg+xml" })
      : r.fulfill({ status: 404, body: "" }),
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, s]) => {
      const el = document.getElementById("card") as unknown as {
        setConfig(c: unknown): void;
        hass: unknown;
        updateComplete: Promise<unknown>;
      };
      el.setConfig(config);
      el.hass = { states: s, callService: () => undefined };
      return el.updateComplete;
    },
    [{ layout: layout(), floor: "ground", view, theme: "light", active_list: false }, s] as const,
  );
  if (view === "3d") await drawn(page);
  return seen;
}
const setStates = (page: Page, s: Record<string, unknown>) =>
  page.evaluate((s) => {
    const el = document.getElementById("card") as unknown as {
      hass: Record<string, unknown>;
      updateComplete: Promise<unknown>;
    };
    el.hass = { ...el.hass, states: s };
    return el.updateComplete;
  }, s);
const art2d = (page: Page) =>
  card(page).evaluate(
    (el, i) => el.shadowRoot!.querySelector(`svg g[data-x="${i}"] image.art`)?.getAttribute("href") ?? null,
    SPK,
  );
const art3d = (page: Page) =>
  holder(page).evaluate(
    (root, i) => root.querySelector(`svg.fp3-ic[data-i="${i}"] image.art`)?.getAttribute("href") ?? null,
    SPK,
  );

test("AC 6, 2D: playing with a valid entity_picture_local draws image.art with that href; other states draw the glyph", async ({
  page,
}) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art2d(page)).toBe(href("ok1"));
  for (const s of ["paused", "idle", "off", "unavailable"]) {
    await setStates(page, speaker(s, { entity_picture_local: href("ok1") }));
    await expect.poll(() => art2d(page), s).toBeNull();
  }
});

test("AC 6, 3D: the overlay icon carries the same image", async ({ page }) => {
  await boot(page, "3d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art3d(page)).toBe(href("ok1"));
  await setStates(page, speaker("paused", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art3d(page)).toBeNull();
});

test("AC 7: in the 3D harness every refused URL draws the glyph and requests nothing off-origin", async ({ page }) => {
  const seen = await boot(page, "3d", speaker("playing", {}));
  for (const v of [
    "//h/x",
    "/\\h/x",
    "javascript:x",
    "data:image/png;base64,x",
    '"><script>',
    "/" + "a".repeat(2999),
    "http://192.168.1.10:8095/imageproxy/x",
  ]) {
    await setStates(page, speaker("playing", { entity_picture_local: v, entity_picture: v }));
    await expect.poll(() => art3d(page), v.slice(0, 30)).toBeNull();
  }
  await page.waitForTimeout(300); // give a stray request the time to show
  expect(seen.filter((u) => !u.startsWith(ORIGIN))).toEqual([]);
  expect(seen.filter((u) => u.includes("imageproxy") || u.includes("/h/x"))).toEqual([]);
});

test("AC 8: an image that 404s gives way to the glyph; a new href draws an image again", async ({ page }) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("bad1") }));
  await expect.poll(() => art2d(page)).toBeNull();
  expect(
    await card(page).evaluate(
      (el, i) => getComputedStyle(el.shadowRoot!.querySelector(`svg g[data-x="${i}"] path`)!).display,
      SPK,
    ),
  ).not.toBe("none");
  await setStates(page, speaker("playing", { entity_picture_local: href("ok2") }));
  await expect.poll(() => art2d(page)).toBe(href("ok2"));
});

test("AC 9: an href change patches the image in place; another device's group keeps its expando", async ({ page }) => {
  await boot(page, "2d", speaker("playing", { entity_picture_local: href("ok1") }));
  await expect.poll(() => art2d(page)).toBe(href("ok1"));
  await card(page).evaluate((el, i) => {
    const svg = el.shadowRoot!.querySelector("svg")!;
    (svg.querySelector('g[data-x="0"]') as unknown as { __keep: number }).__keep = 1;
    (window as unknown as { __img: Element }).__img = svg.querySelector(`g[data-x="${i}"] image.art`)!;
  }, SPK);
  await setStates(page, speaker("playing", { entity_picture_local: href("ok2") }));
  const r = await card(page).evaluate((el, i) => {
    const svg = el.shadowRoot!.querySelector("svg")!,
      img = svg.querySelector(`g[data-x="${i}"] image.art`);
    return {
      keep: (svg.querySelector('g[data-x="0"]') as unknown as { __keep?: number }).__keep,
      same: img === (window as unknown as { __img: Element }).__img,
      href: img?.getAttribute("href"),
    };
  }, SPK);
  expect(r).toEqual({ keep: 1, same: true, href: href("ok2") });
});
