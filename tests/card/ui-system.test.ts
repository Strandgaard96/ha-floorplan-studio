import { describe, expect, it } from "vitest";
import { FloorplanStudioCard } from "../../src/card/floorplan-studio-card";
import { FpSearch } from "../../src/card/search-box";

// Card UI refactor, lane ui-system (docs/specs/card-ui-refactor.md items 12 to 14): the card's own chrome (everything
// but FLOORPLAN_CSS, which draws the plan) speaks one type scale, one spacing scale, two radii and two shadows. The
// pixels are read back from Chromium in ui-system-css.spec.ts (CLAUDE.md finding 10); this file pins the source text.

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const cardCss = strip(
  (FloorplanStudioCard.styles as unknown as { toString(): string }[])
    .slice(1) // [0] is FLOORPLAN_CSS, the plan's stylesheet
    .map(String)
    .join("\n"),
);
const searchCss = strip(String((FpSearch as unknown as { styles: unknown }).styles));
const all = `${cardCss}\n${searchCss}`;

/** Every `name: value` declaration, with the rule's selector for the message. */
function decls(css: string): { sel: string; prop: string; value: string }[] {
  const out: { sel: string; prop: string; value: string }[] = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g))
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0)
        out.push({ sel: m[1].trim().replace(/\s+/g, " "), prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() });
    }
  return out;
}
const D = decls(all);

describe("UI refactor 12: type scale 12 / 14 / 16", () => {
  it("every font size in the card's chrome is 12, 14 or 16 px, in px (no em, no 10, 11 or 13)", () => {
    const bad: string[] = [];
    for (const { sel, prop, value } of D) {
      if (prop === "font") {
        const m = /(\d+(?:\.\d+)?)(px|em|rem|%)\b/.exec(value.replace(/\/[\d.]+/, ""));
        if (m && !(m[2] === "px" && [12, 14, 16].includes(Number(m[1])))) bad.push(`${sel} { font: ${value} }`);
      }
      if (prop === "font-size" && !/^(12|14|16)px$/.test(value)) bad.push(`${sel} { font-size: ${value} }`);
    }
    expect(bad).toEqual([]);
  });
});

describe("UI refactor 13: spacing and radius tokens", () => {
  it("the host defines the spacing, radius and shadow tokens on the scale", () => {
    const host = D.filter((d) => d.sel === ":host").map((d) => `${d.prop}:${d.value}`);
    for (const t of [
      "--fp-space-1:4px",
      "--fp-space-2:8px",
      "--fp-space-3:12px",
      "--fp-space-4:16px",
      "--fp-space-5:24px",
      "--fp-radius-control:6px",
      "--fp-radius-surface:12px",
      "--fp-radius-pill:999px",
    ])
      expect(host, t).toContain(t);
    expect(host.some((h) => h.startsWith("--fp-shadow-sm:"))).toBe(true);
    expect(host.some((h) => h.startsWith("--fp-shadow-lg:"))).toBe(true);
  });

  it("padding, margin and gap use no off-scale px value (2, 3, 5, 6, 10, 14, 20)", () => {
    const bad = D.filter(
      (d) =>
        /^(padding|margin|gap)(-|$)/.test(d.prop) &&
        // a 1 px optical nudge on an icon is not spacing, and 0 / 4 / 8 / 12 / 16 / 24 are the scale
        d.value.split(/\s+/).some((v) => /^-?(2|3|5|6|10|14|20)px$/.test(v)),
    ).map((d) => `${d.sel} { ${d.prop}: ${d.value} }`);
    expect(bad).toEqual([]);
  });

  it("every border-radius is a token, a pill, a circle or 0 (no 4, 8 or 10 px)", () => {
    const bad = D.filter(
      (d) =>
        d.prop === "border-radius" &&
        d.value
          .replace(/var\(--fp-radius-(control|surface|pill)(, *\d+px)?\)/g, "")
          .split(/\s+/)
          .some((v) => v !== "" && !["0", "50%", "999px"].includes(v)),
    ).map((d) => `${d.sel} { ${d.prop}: ${d.value} }`);
    expect(bad).toEqual([]);
  });
});

describe("UI refactor 14: shadows are tokens coloured from --fp-ink", () => {
  it("no rgba(0, 0, 0, …) or black shadow anywhere in the card's CSS", () => {
    expect(all).not.toMatch(/rgba?\(\s*0\s*,\s*0\s*,\s*0/);
  });
  it("both shadow tokens are a tight and a soft layer mixed from --fp-ink", () => {
    for (const name of ["--fp-shadow-sm", "--fp-shadow-lg"]) {
      const v = D.find((d) => d.prop === name && d.sel === ":host")?.value ?? "";
      expect(v.split("color-mix").length - 1, `${name}: two color-mix layers`).toBe(2);
      expect(v, name).toContain("var(--fp-ink)");
      expect(v, name).not.toMatch(/#|\brgba?\(/);
    }
  });
  it("box-shadow elsewhere is one of the tokens, a ring or none", () => {
    const bad = D.filter(
      (d) =>
        d.prop === "box-shadow" &&
        !/^(none|var\(--fp-shadow-(sm|lg)\b|inset 0 0 0 1px var\(--fp-primary\)|0 0 0 \d+(px)? .*)/.test(d.value),
    ).map((d) => `${d.sel} { ${d.prop}: ${d.value} }`);
    expect(bad).toEqual([]);
  });
});
