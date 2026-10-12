/**
 * What the Align panel says (S30.6). Pure text from the result `alignFloor` returns; nothing here reads a layout.
 * Every string is plain text: the panel renders it with Lit text bindings, so a name is never HTML here.
 * Junk in, no `NaN` out: a number that is not finite reads as 0, a place or pivot that is not a pair as identity.
 */
import { normaliseTurn, placePoint } from "./floor-stack";
import type { Place } from "./floor-stack";
import type { Pt } from "./schema";

/** The shape S30.1 fixed (`docs/specs/hand-align.md`, Sprint 30). Declared here so this file reads nothing of `align.ts`. */
export interface AlignChoice {
  turn: number;
  t: Pt;
  score: number;
  weak: boolean;
  alt: { turn: number; score: number } | null;
}

export interface AlignSummary {
  /** "82 % match", "Weak match: 20 %. ...", or "Nothing to match". */
  score: string;
  /** Only when the result carries `alt`. */
  alt: string | null;
  /** The change from the current place in words, or "Already aligned"; "" when there is no result. */
  move: string;
}

/** Under this a turn is not worth words. */
const TURN_WORDS_FROM = 0.05;
/** A move under half a centimetre rounds to nothing. */
const MOVE_WORDS_FROM = 0.5;
/** An `alt` this many points above the answer "fits better" (the spec's `TIE`). */
const BETTER_BY = 1;
/** How far from 90 or 180 a turn still counts as a quarter or a half turn. */
const NEAR_TURN = 10;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pair = (v: unknown): Pt => (Array.isArray(v) ? [num(v[0]), num(v[1])] : [0, 0]);
const placeOf = (v: any): Place => ({ turn: num(v?.turn), shift: pair(v?.shift) });
/** `x` to one decimal, never "-0.0". */
const deg1 = (x: number): string => ((Math.round(x * 10) / 10 || 0)).toFixed(1);
const percent = (x: unknown): number => Math.max(0, Math.min(100, Math.round(num(x))));

function usable(r: unknown): AlignChoice | null {
  if (!r || typeof r !== "object") return null;
  const o = r as any;
  const a = o.alt, alt = a && typeof a === "object" && Number.isFinite(a.turn) && Number.isFinite(a.score) ? { turn: a.turn as number, score: a.score as number } : null;
  return { turn: num(o.turn), t: pair(o.t), score: num(o.score), weak: o.weak === true, alt };
}

/** The turn from the current place to the answer, the short way, clockwise positive. */
function turnChange(r: AlignChoice, place: Place): number {
  const d = normaliseTurn(r.turn - place.turn);
  return Math.abs(d) < TURN_WORDS_FROM ? 0 : d;
}

function altWords(r: AlignChoice): string | null {
  if (!r.alt) return null;
  const d = normaliseTurn(r.alt.turn - r.turn);
  const a = Math.abs(d);
  const what = Math.abs(a - 180) <= NEAR_TURN ? "A half turn" : Math.abs(a - 90) <= NEAR_TURN ? "A quarter turn" : `A turn of ${deg1(a)}°`;
  const shown = what.startsWith("A turn of") ? "" : ` (${deg1(normaliseTurn(r.alt.turn))}°)`;
  const how = r.alt.score - r.score > BETTER_BY ? "fits better" : "fits about as well";
  return `${what}${shown} ${how} (${percent(r.alt.score)} %). Check the plan before you apply it.`;
}

function moveWords(r: AlignChoice, place: Place, pivot: Pt): string {
  const turn = turnChange(r, place);
  const from = placePoint(place, pivot);
  const to = placePoint({ turn: r.turn, shift: r.t }, pivot);
  const dx = num(to[0] - from[0]), dy = num(to[1] - from[1]);
  const parts: string[] = [];
  if (turn) parts.push(`Turn ${deg1(Math.abs(turn))}° ${turn > 0 ? "clockwise" : "anticlockwise"}`);
  const sides: string[] = [];
  if (Math.abs(dx) >= MOVE_WORDS_FROM && Math.round(Math.abs(dx)) > 0) sides.push(`${Math.round(Math.abs(dx))} cm ${dx > 0 ? "right" : "left"}`);
  if (Math.abs(dy) >= MOVE_WORDS_FROM && Math.round(Math.abs(dy)) > 0) sides.push(`${Math.round(Math.abs(dy))} cm ${dy > 0 ? "down" : "up"}`);
  if (sides.length) parts.push(`${turn ? "move" : "Move"} the centre ${sides.join(", ")}`);
  return parts.length ? parts.join(", ") : "Already aligned";
}

/**
 * The panel's lines for `result`, as the plan stands (`place`: the floor's current turn and shift in the floor below's
 * stored frame) and about `pivot` (`floorPivot`, in the upper floor's own frame). Up is smaller y, as on screen.
 */
export function alignSummary(result: unknown, place: unknown, pivot: unknown): AlignSummary {
  const r = usable(result);
  if (!r) return { score: "Nothing to match", alt: null, move: "" };
  const p = percent(r.score);
  const score = r.weak ? `Weak match: ${p} %. Check the plan before you apply it` : `${p} % match`;
  return { score, alt: altWords(r), move: moveWords(r, placeOf(place), pair(pivot)) };
}

/** Apply's status line: "Aligned to Ground: 82 % match, turned 4.0°". The turn is the change, signed (clockwise positive), left out under 0.05. */
export function alignStatus(result: unknown, place: unknown, belowName: unknown): string {
  const r = usable(result);
  if (!r) return "Nothing to match";
  const name = typeof belowName === "string" && belowName ? belowName : "the floor below";
  const turn = turnChange(r, placeOf(place));
  return `Aligned to ${name}: ${percent(r.score)} % match${turn ? `, turned ${deg1(turn)}°` : ""}`;
}
