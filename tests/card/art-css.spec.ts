import { test, expect, type Page } from "@playwright/test";
import { demo } from "./helpers-3d";
import { FLOORPLAN_CSS, renderFloor } from "../../src/core/render";

// S29 (A4, AC 10): under .art the glyph is gone and the halo is a ring in the device colour; at far the art goes and the glyph is the
// far dot again. Read back from Chromium (finding 10). The markup is renderFloor's own; the href never loads (about:blank), which
// does not matter here: only the rules are read.
const OK = "/api/media_player_proxy/media_player.kitchen?token=FAKE0123&cache=3f2a";
const floor = () => {
  const f = structuredClone(demo.floors.ground);
  f.devices.push({
    id: "spk",
    type: "speaker",
    entity: "media_player.kitchen",
    name: "Kitchen speaker",
    x: 700,
    y: 300,
  });
  return f;
};
const SPK = 12;
const state = {
  "media_player.kitchen": {
    state: "playing",
    attributes: { entity_picture_local: OK },
    last_changed: "2026-10-12T10:00:00Z",
  },
};
const markup = (detail?: "far" | "mid" | "near") =>
  renderFloor(floor() as never, {
    scale: 1,
    state: state as never,
    now: Date.parse("2026-10-12T10:00:05Z"),
    mediaArt: true,
    detail,
  });
const plan = (theme: string, body: string) => {
  const [t, mode] = theme === "ha-dark" ? ["ha", "dark"] : [theme, "light"];
  return `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg width="1000" height="800" viewBox="0 0 1000 800"><g data-theme="${t}" data-mode="${mode}" id="p">${body}</g></svg></body></html>`;
};
const read = (page: Page) =>
  page.evaluate((i) => {
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (c: string) => {
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "#000";
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const g = document.querySelector(`g[data-x="${i}"]`)!,
      path = getComputedStyle(g.querySelector("path")!),
      halo = getComputedStyle(g.querySelector(".halo")!),
      img = getComputedStyle(g.querySelector("image.art")!);
    return {
      cls: g.getAttribute("class"),
      glyph: path.display,
      art: img.display,
      fillOpacity: halo.fillOpacity,
      stroke: rgb(halo.stroke),
      strokeWidth: halo.strokeWidth,
      speaker: rgb(getComputedStyle(document.getElementById("p")!).getPropertyValue("--fp-dev-speaker").trim()),
    };
  }, SPK);

for (const theme of ["light", "blueprint", "ha-dark"]) {
  test(`${theme}: under .art the glyph is display:none and the halo is a ring with no fill (AC 10)`, async ({
    page,
  }) => {
    await page.setContent(plan(theme, markup()));
    const r = await read(page);
    expect(r.cls).toMatch(/\bart\b/);
    expect(r.glyph).toBe("none");
    expect(r.art).not.toBe("none");
    expect(r.fillOpacity).toBe("0");
    expect(r.stroke).toEqual(r.speaker);
    expect(r.strokeWidth).toBe("2px");
  });
  test(`${theme}: at far the art is hidden and the glyph and the filled disc are back; at mid the art shows (AC 10)`, async ({
    page,
  }) => {
    await page.setContent(plan(theme, markup("far")));
    const far = await read(page);
    expect(far.art).toBe("none");
    expect(far.glyph).not.toBe("none");
    expect(far.fillOpacity).toBe("1");
    await page.setContent(plan(theme, markup("mid")));
    const mid = await read(page);
    expect(mid.art).not.toBe("none");
    expect(mid.glyph).toBe("none");
  });
}
