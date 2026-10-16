import { describe, it, expect } from "vitest";
import { alignSummary, alignStatus } from "../../src/core/align-words";
import { placePoint } from "../../src/core/floor-stack";

// The result shape is the one S30.1 fixed (docs/specs/hand-align.md, Sprint 30): { turn, t, score, weak, alt }.
const ID = { turn: 0, shift: [0, 0] as [number, number] };
const res = (o: Record<string, unknown> = {}) => ({ turn: 0, t: [0, 0], score: 82.4, weak: false, alt: null, ...o });
const all = (s: ReturnType<typeof alignSummary>) => [s.score, s.alt ?? "", s.move].join("\n");

describe("alignSummary (S30.6)", () => {
  it("says the match, and the move of the centre in the floor below's frame", () => {
    // pivot [100, 50], turned 4 degrees clockwise about the stored origin, then shifted by t.
    const pivot: [number, number] = [100, 50];
    const r = res({ turn: 4, t: [30, -20] });
    // worked by hand: R(4) · [100, 50] = [96.27, 56.85]; plus [30, -20] is [126.27, 36.85]; the centre moved 26.27 right, 13.15 up
    expect(placePoint({ turn: 4, shift: [30, -20] }, pivot).map((v) => Math.round(v * 100) / 100)).toEqual([
      126.27, 36.85,
    ]);
    const s = alignSummary(r, ID, pivot);
    expect(s.score).toBe("82 % match");
    expect(s.alt).toBeNull();
    expect(s.move).toBe("Turn 4.0° clockwise, move the centre 26 cm right, 13 cm up");
  });

  it("moves the centre by the difference from the current place, not from the origin", () => {
    const place = { turn: 1.5, shift: [10, 5] as [number, number] };
    const s = alignSummary(res({ turn: 1.5, t: [25, -8] }), place, [0, 0]);
    expect(s.move).toBe("Move the centre 15 cm right, 13 cm up");
  });

  it("the turn is the short way, clockwise or anticlockwise", () => {
    const at = (turn: number, from = 0) => alignSummary(res({ turn }), { turn: from, shift: [0, 0] }, [0, 0]).move;
    expect(at(-2.5)).toBe("Turn 2.5° anticlockwise");
    expect(at(7.3)).toBe("Turn 7.3° clockwise");
    expect(at(-177, 180)).toBe("Turn 3.0° clockwise");
    expect(at(177, -180)).toBe("Turn 3.0° anticlockwise");
    expect(at(-178, 179)).toBe("Turn 3.0° clockwise");
    expect(at(179, -178)).toBe("Turn 3.0° anticlockwise");
    expect(at(-3 + 0, 0)).not.toMatch(/357|363/);
  });

  it("no turn words under 0.05 degree; says Already aligned when nothing changes", () => {
    const p = { turn: 10, shift: [3, 4] as [number, number] };
    expect(alignSummary(res({ turn: 10.04, t: [3, 4] }), p, [0, 0]).move).toBe("Already aligned");
    expect(alignSummary(res({ turn: 10.06, t: [3, 4] }), p, [0, 0]).move).toBe("Turn 0.1° clockwise");
    expect(alignSummary(res({ turn: 10, t: [3, 4] }), p, [0, 0]).move).toBe("Already aligned");
    // a move under half a centimetre reads as no move
    expect(alignSummary(res({ turn: 10, t: [3.3, 4.2] }), p, [0, 0]).move).toBe("Already aligned");
    expect(alignSummary(res({ turn: 10, t: [3.8, 4] }), p, [0, 0]).move).toBe("Move the centre 1 cm right");
    expect(alignSummary(res({ turn: 10, t: [3, 7.4] }), p, [0, 0]).move).toBe("Move the centre 3 cm down");
  });

  it("weak says so", () => {
    const s = alignSummary(res({ score: 19.7, weak: true }), ID, [0, 0]);
    expect(s.score).toBe("Weak match: 20 %. Check the plan before you apply it");
  });

  it("alt: a half turn, a quarter turn, another turn; better or about as well", () => {
    const half = alignSummary(res({ turn: 4, score: 81.9, alt: { turn: -176, score: 81.3 } }), ID, [0, 0]);
    expect(half.alt).toBe("A half turn (-176.0°) fits about as well (81 %). Check the plan before you apply it.");
    const quarter = alignSummary(res({ turn: -2.5, score: 68.4, alt: { turn: 93, score: 70.7 } }), ID, [0, 0]);
    expect(quarter.alt).toBe("A quarter turn (93.0°) fits better (71 %). Check the plan before you apply it.");
    const other = alignSummary(res({ turn: 0, score: 60, alt: { turn: 7.5, score: 58.2 } }), ID, [0, 0]);
    expect(other.alt).toBe("A turn of 7.5° fits about as well (58 %). Check the plan before you apply it.");
    const negq = alignSummary(res({ turn: 10, score: 60, alt: { turn: -82, score: 61 } }), ID, [0, 0]);
    expect(negq.alt).toMatch(/^A quarter turn \(-82\.0°\) fits about as well/); // exactly 1 point above: not better
    // the chosen turn is not 0: the alt is a half turn away from it, wherever the numbers sit
    const far = alignSummary(res({ turn: 177.5, score: 68.4, alt: { turn: -2.5, score: 68 } }), ID, [0, 0]);
    expect(far.alt).toMatch(/^A half turn \(-2\.5°\)/);
  });

  it("nothing to match when there is no result", () => {
    const s = alignSummary(null, ID, [0, 0]);
    expect(s.score).toBe("Nothing to match");
    expect(s.alt).toBeNull();
    expect(s.move).toBe("");
  });

  it("junk numbers never put NaN, undefined, Infinity or -0 in a string", () => {
    const junk = [NaN, Infinity, -Infinity, "7", null, undefined, {}, [], 1e308];
    for (const j of junk) {
      const cases = [
        res({ turn: j }),
        res({ t: [j, j] }),
        res({ t: j }),
        res({ score: j }),
        res({ alt: { turn: j, score: j } }),
        res({ alt: j }),
        res({ weak: j }),
        j,
      ];
      for (const r of cases) {
        for (const place of [ID, { turn: j, shift: [j, j] }, j, { turn: 1, shift: j }]) {
          for (const pivot of [[0, 0], [j, j], j]) {
            const s = alignSummary(r as any, place as any, pivot as any);
            expect(all(s)).not.toMatch(/NaN|undefined|Infinity|null|object|-0(?![.\d])/);
            expect(alignStatus(r as any, place as any, j as any)).not.toMatch(/NaN|undefined|Infinity|object/);
          }
        }
      }
    }
  });

  it("a name with markup is plain text in the status, untouched", () => {
    const name = `"><script>alert(1)</script>`;
    const s = alignStatus(res({ turn: 4, score: 81.9 }), ID, name);
    expect(s).toBe(`Aligned to ${name}: 82 % match, turned 4.0° clockwise`);
    // the only place a name goes is the status; the summary lines carry none
    const sum = alignSummary(res({ turn: 4, alt: { turn: -176, score: 80 } }), ID, [0, 0]);
    expect(all(sum)).not.toContain("<");
  });
});

describe("alignStatus (S30.6)", () => {
  it("says the match and the turn it made", () => {
    expect(alignStatus(res({ turn: 4, score: 81.9 }), ID, "Ground")).toBe(
      "Aligned to Ground: 82 % match, turned 4.0° clockwise",
    );
    expect(alignStatus(res({ turn: -2.5, score: 68.4 }), ID, "Ground")).toBe(
      "Aligned to Ground: 68 % match, turned 2.5° anticlockwise",
    );
    expect(alignStatus(res({ turn: -177, score: 90 }), { turn: 180, shift: [0, 0] }, "Ground")).toBe(
      "Aligned to Ground: 90 % match, turned 3.0° clockwise",
    );
  });
  it("leaves the turn out when it did not turn", () => {
    expect(alignStatus(res({ turn: 10.02, score: 50.5 }), { turn: 10, shift: [0, 0] }, "Ground")).toBe(
      "Aligned to Ground: 51 % match",
    );
  });
  it("no result, no name", () => {
    expect(alignStatus(null, ID, "Ground")).toBe("Nothing to match");
    expect(alignStatus(res(), ID, undefined as any)).toBe("Aligned to the floor below: 82 % match");
  });
});

describe("Opus review: an alt with no usable turn is dropped", () => {
  it("NaN, junk or missing numbers in alt never read as 0.0 degrees", () => {
    for (const alt of [
      { turn: NaN, score: 70 },
      { turn: "x", score: 70 },
      { turn: 90 },
      { turn: 90, score: NaN },
      { score: 70 },
      {},
    ]) {
      const s = alignSummary(res({ turn: 4, score: 70, alt }), ID, [0, 0]);
      expect(s.alt, JSON.stringify(alt)).toBeNull();
    }
    expect(alignSummary(res({ turn: 4, score: 70, alt: { turn: 93, score: 70 } }), ID, [0, 0]).alt).not.toBeNull();
    expect(alignStatus(res({ alt: { turn: NaN, score: 1 } }), ID, "Ground")).toBe("Aligned to Ground: 82 % match");
  });
});
