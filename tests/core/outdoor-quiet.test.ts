import { describe, expect, it } from "vitest";
import { FLOORPLAN_CSS, THEMES } from "../../src/core/render";
import { contrast, mixSrgb } from "../../src/core/ink";

// UI refactor 17: a garden bigger than the house must not outweigh it. Every outdoor kind is drawn through a "-fill" token that
// mixes the kind colour into the background, so it sits closer to the background than an unpainted indoor room does, in every
// theme, and still differs from the background and from the other outdoor kinds. The mix is CSS (`color-mix`); this test redoes
// it from the same CSS text, so the assertions are about what the stylesheet says, not about constants kept beside it.
// (The `ha` theme takes its neutrals from the user's Home Assistant, so it has no fixed hex to measure here.)

const OUTDOOR = ["garden", "terrace", "pavement", "water"] as const;

/** The token block a theme's selector carries: the one that names --fp-garden. */
function tokensOf(theme: string): Map<string, string> {
  const re = new RegExp(`\\[data-theme="${theme}"\\]\\{([^}]*--fp-garden:[^}]*)\\}`);
  const body = re.exec(FLOORPLAN_CSS)?.[1] ?? "";
  return new Map(
    body
      .split(";")
      .flatMap((p) =>
        p.includes(":")
          ? [[p.slice(0, p.indexOf(":")).trim(), p.slice(p.indexOf(":") + 1).trim()] as [string, string]]
          : [],
      ),
  );
}

/** `--fp-<kind>-fill` as the stylesheet defines it: `color-mix(in srgb,var(--fp-<kind>) N%,var(--fp-bg))`. */
function quietShare(kind: string): number {
  const m = new RegExp(`--fp-${kind}-fill:color-mix\\(in srgb,var\\(--fp-${kind}\\) (\\d+)%,var\\(--fp-bg\\)\\)`).exec(
    FLOORPLAN_CSS,
  );
  expect(m, `--fp-${kind}-fill is a color-mix of the kind colour into --fp-bg`).not.toBeNull();
  return Number(m![1]) / 100;
}

describe("outdoor kinds are quieter than a room (UI refactor 17)", () => {
  const themes = THEMES.filter((t) => t !== "ha");
  for (const theme of themes) {
    it(`${theme}: closer to the background than a room, still distinct`, () => {
      const t = tokensOf(theme);
      const bg = t.get("--fp-bg")!;
      const resolve = (v: string) => (v.startsWith("var(") ? t.get(v.slice(4, -1))! : v);
      const roomEmpty = resolve(t.get("--fp-room-empty")!);
      const room = contrast(roomEmpty, bg);
      const fills = OUTDOOR.map((k) => mixSrgb(t.get(`--fp-${k}`)!, bg, quietShare(k)));
      fills.forEach((f, i) => {
        const c = contrast(f, bg);
        expect(c, `${theme} ${OUTDOOR[i]} ${f} against ${bg} is quieter than the room ${roomEmpty}`).toBeLessThan(room);
        expect(c, `${theme} ${OUTDOOR[i]} still differs from the background`).toBeGreaterThan(1.02);
      });
      expect(new Set(fills).size, `${theme}: four outdoor kinds, four fills ${fills.join(" ")}`).toBe(4);
    });
  }
});
