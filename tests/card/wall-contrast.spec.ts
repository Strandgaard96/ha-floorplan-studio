import { test, expect } from "@playwright/test";
import { FLOORPLAN_CSS, THEMES } from "../../src/core/render";

// UI refactor, item 7: a wall must read against the floor (3:1) without being the loudest thing on the plan. HA dark used
// to draw walls in Home Assistant's text colour, near white (13:1), louder than any device. Read back from Chromium in every
// theme, with HA's own variables set for the ha theme in both modes (finding 10).

const HA = {
  light:
    "--primary-text-color:#212121;--secondary-text-color:#727272;--card-background-color:#ffffff;--secondary-background-color:#e5e5e5",
  dark: "--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--card-background-color:#1c1c1c;--secondary-background-color:#282828",
};
const CASES = [
  ...THEMES.map((t) => ({ t: t as string, mode: "light", vars: t === "ha" ? HA.light : "" })),
  { t: "ha", mode: "dark", vars: HA.dark },
];
const probe = (cls: string, v: string) => `<rect class="${cls}" style="fill:var(${v})"/>`;
const body = `<polygon class="room room-room" points="0,0 10,0 10,10"/><polygon class="room room-garden" points="0,0 10,0 10,10"/>
<polygon class="room room-terrace" points="0,0 10,0 10,10"/><polygon class="room room-pavement" points="0,0 10,0 10,10"/>
<polygon class="room room-room paint" fill="#cc3333" points="0,0 10,0 10,10"/>
${probe("p-bg", "--fp-bg")}${probe("p-ink", "--fp-ink")}${probe("p-wall", "--fp-wall")}${probe("p-ext", "--fp-wall-external")}`;
const html = `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg>${CASES.map((c, i) => `<g id="c${i}" style="${c.vars}"><g data-theme="${c.t}" data-mode="${c.mode}">${body}</g></g>`).join("")}</svg></body></html>`;

const rgb = (s: string): number[] => {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(s);
  if (srgb) return srgb.slice(1, 4).map(Number);
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s);
  if (!m) throw new Error(`not a colour: ${s}`);
  return m.slice(1, 4).map((v) => Number(v) / 255);
};
const lum = (s: string) => {
  const [r, g, b] = rgb(s).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("every theme's walls read 3:1 on the floor and the room fill; HA dark's are mid grey, not the text colour", async ({
  page,
}) => {
  await page.setContent(html);
  const r = await page.evaluate(
    (n) =>
      Array.from({ length: n }, (_, i) => {
        const g = document.getElementById(`c${i}`)!;
        const cs = (sel: string) => getComputedStyle(g.querySelector(sel)!).fill;
        return {
          room: cs(".room-room:not([fill])"),
          garden: cs(".room-garden"),
          terrace: cs(".room-terrace"),
          pavement: cs(".room-pavement"),
          bg: cs(".p-bg"),
          ink: cs(".p-ink"),
          wall: cs(".p-wall"),
          ext: cs(".p-ext"),
        };
      }),
    CASES.length,
  );
  const rows: string[] = [];
  CASES.forEach((c, i) => {
    const v = r[i],
      tag = `${c.t}${c.t === "ha" ? `/${c.mode}` : ""}`;
    rows.push(
      `${tag.padEnd(16)} wall/room ${contrast(v.wall, v.room).toFixed(2)} wall/bg ${contrast(v.wall, v.bg).toFixed(2)} wall/garden ${contrast(v.wall, v.garden).toFixed(2)} ext/bg ${contrast(v.ext, v.bg).toFixed(2)} ink/bg ${contrast(v.ink, v.bg).toFixed(2)} ${v.wall}`,
    );
    for (const k of ["room", "bg", "garden", "terrace", "pavement"] as const)
      expect(contrast(v.wall, v[k]), `${tag}: wall vs ${k}`).toBeGreaterThanOrEqual(3);
    if (tag === "ha/dark") {
      // mid grey, not white, and not the loudest thing: well under the text colour's contrast, external wall too
      expect(lum(v.wall), "ha/dark wall is mid grey").toBeLessThan(0.35);
      expect(lum(v.ext), "ha/dark external wall is mid grey").toBeLessThan(0.45);
      expect(contrast(v.wall, v.bg), "ha/dark wall quieter than the text").toBeLessThan(contrast(v.ink, v.bg) - 4);
      expect(contrast(v.ext, v.bg), "ha/dark external wall quieter than the text").toBeLessThan(
        contrast(v.ink, v.bg) - 2,
      );
      expect(contrast(v.ext, v.bg), "ha/dark external wall at least as strong as the wall").toBeGreaterThan(
        contrast(v.wall, v.bg),
      );
    }
  });
  console.log(rows.join("\n"));
});
