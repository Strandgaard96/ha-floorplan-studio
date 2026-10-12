import { describe, expect, it } from "vitest";
import demo from "../../demo/layout.json";
import type { Layout } from "../../src/core/schema";
import { artUrl, MAX_ART_URL } from "../../src/core/schema";
import { renderFloor } from "../../src/core/render";
import { liveOf } from "../../src/core/live";

// S29 (A1-A5, AC 5, AC 6): the art URL is the one outside value on the plan; only a same-origin relative path passes.
const OK = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=3f2a";
const NOW = Date.parse("2026-10-12T10:00:00Z");

describe("artUrl (AC 5)", () => {
  it("entity_picture_local wins", () =>
    expect(artUrl({ entity_picture_local: OK, entity_picture: "/api/b.png" })).toBe(OK));
  it("a relative entity_picture is the fallback, also when the local one is refused", () => {
    expect(artUrl({ entity_picture: "/api/x.png" })).toBe("/api/x.png");
    expect(artUrl({ entity_picture_local: "//h/x", entity_picture: "/api/x.png" })).toBe("/api/x.png");
  });
  const REFUSED: unknown[] = [
    "//h/x",
    "/\\h/x",
    "javascript:x",
    "data:image/png;base64,x",
    '"><script>',
    '/"><script>',
    "/" + "a".repeat(2999),
    "http://192.168.1.10:8095/imageproxy/x",
    "",
    "/a b",
    42,
    null,
  ];
  it.each(REFUSED.map((v) => [JSON.stringify(v).slice(0, 40), v]))("%s is refused", (_, v) =>
    expect(artUrl({ entity_picture_local: v, entity_picture: v })).toBeNull(),
  );
  it("2048 characters is the limit", () => {
    expect(artUrl({ entity_picture: "/" + "a".repeat(MAX_ART_URL - 1) })).not.toBeNull();
    expect(artUrl({ entity_picture: "/" + "a".repeat(MAX_ART_URL) })).toBeNull();
  });
  it("junk attributes are null, never a throw", () => {
    for (const a of [null, undefined, 5, "x", [], Object.create(null)]) expect(artUrl(a)).toBeNull();
  });
});

describe("the art on a device icon (A3, A5, AC 6)", () => {
  const f = structuredClone((demo as unknown as Layout).floors.ground);
  f.devices.push({
    id: "spk",
    type: "speaker",
    entity: "media_player.kitchen",
    name: "Kitchen speaker",
    x: 700,
    y: 300,
  } as never);
  const SPK = f.devices.length - 1; // 12
  const at = (state: string, attributes: Record<string, unknown> = { entity_picture_local: OK }) => ({
    "media_player.kitchen": { state, attributes, last_changed: "2026-10-12T10:00:00Z" },
  });
  const group = (svg: string) => svg.match(new RegExp(`<g data-x="${SPK}"[^>]*>.*?</g>`, "s"))![0];
  const draw = (state: ReturnType<typeof at>, extra: object = {}) =>
    group(renderFloor(f, { scale: 1, now: NOW, state: state as never, mediaArt: true, ...extra }));

  it("a playing speaker draws image.art after the glyph, clipped to the halo's circle", () => {
    const g = draw(at("playing"));
    expect(g).toMatch(new RegExp(`^<g data-x="${SPK}" class="dev dev-speaker on art"`));
    expect(g).toContain(
      `<clipPath id="fp-art-${SPK}"><circle cx="12" cy="12" r="16"/></clipPath><image class="art" href="${OK.replace(/&/g, "&amp;")}" x="-4" y="-4" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#fp-art-${SPK})"/>`,
    );
    expect(g.indexOf("<path")).toBeLessThan(g.indexOf("<image"));
  });
  it.each(["paused", "idle", "off", "unavailable"])("%s draws the glyph and no image", (s) => {
    const g = draw(at(s));
    expect(g).not.toContain("<image");
    expect(g).not.toMatch(/class="[^"]*\bart\b/);
  });
  it("mediaArt omitted or false draws no image: byte for byte as before", () => {
    const plain = renderFloor(f, { scale: 1, now: NOW, state: at("playing") as never });
    expect(renderFloor(f, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: false })).toBe(plain);
    expect(plain).not.toContain("<image");
  });
  it("a failed href draws the glyph; another href draws again (A6)", () => {
    expect(draw(at("playing"), { artFailed: new Set([OK]) })).not.toContain("<image");
    expect(draw(at("playing", { entity_picture_local: "/api/other.png" }), { artFailed: new Set([OK]) })).toContain(
      'href="/api/other.png"',
    );
  });
  it("media draws art too; a tv does not (A1)", () => {
    const g = structuredClone(f);
    g.devices[SPK] = { ...(g.devices[SPK] as object), type: "media" } as never;
    expect(group(renderFloor(g, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: true }))).toContain(
      '<image class="art"',
    );
    g.devices[SPK] = { ...(g.devices[SPK] as object), type: "tv" } as never;
    expect(group(renderFloor(g, { scale: 1, now: NOW, state: at("on") as never, mediaArt: true }))).not.toContain(
      "<image",
    );
  });
  it("a URL with & and ' reaches the attribute escaped, and a payload never does", () => {
    expect(draw(at("playing", { entity_picture_local: "/a?b=1&c='2'" }))).toContain(`href="/a?b=1&amp;c='2'"`);
    const bad = draw(at("playing", { entity_picture_local: '/"><script>alert(1)</script>' }));
    expect(bad).not.toContain("<script");
    expect(bad).not.toContain("<image");
  });
  it("liveOf hands the same icon to the 3D overlay", () => {
    const l = liveOf(f, { scale: 1, now: NOW, state: at("playing") as never, mediaArt: true }, NOW);
    expect(l.devices[SPK]!.icon).toContain(`<image class="art" href="${OK.replace(/&/g, "&amp;")}"`);
    expect(l.devices[SPK]!.klass).toMatch(/\bart\b/);
  });
});
