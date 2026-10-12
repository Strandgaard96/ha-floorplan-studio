import type { StateOverlay } from "./render";
import { meanText } from "./state-text";

/** One entity's state, or `undefined` when there is none. State is untrusted: only an own key holding text counts
 *  (finding 1), so an entity named `__proto__` or a half-built overlay reads as no state, never a throw. */
export function stateOf(state: StateOverlay | undefined, entity: string): StateOverlay[string] | undefined {
  return state && Object.prototype.hasOwnProperty.call(state, entity) && typeof state[entity]?.state === "string"
    ? state[entity]
    : undefined;
}

/** A mean reading and the unit it was read in (the unit of the first readable sensor). */
export interface MeanValue {
  n: number;
  unit: string;
}

/** S29 (H1): the mean of the readable states of `list`, in the unit of the first one read; null when none is readable.
 *  Readings in any other unit are left out, not converted: a mean of 21 °C and 70 °F (45.5) means nothing. `meanReading`
 *  is built on this, so a room's text and its colour can never come from different numbers. */
export function meanValue(list: string[], state: StateOverlay | undefined): MeanValue | null {
  const all = (Array.isArray(list) ? list : []).flatMap((e) => {
    const s = stateOf(state, e),
      t = s?.state.trim() ?? "";
    return s && /^-?\d+(\.\d+)?$/.test(t) && Number.isFinite(Number(t))
      ? [
          {
            n: Number(t),
            unit: typeof s.attributes?.unit_of_measurement === "string" ? s.attributes.unit_of_measurement : "",
          },
        ]
      : [];
  });
  if (!all.length) return null;
  const unit = all[0].unit,
    rs = all.filter((r) => r.unit === unit);
  return { n: rs.reduce((n, r) => n + r.n, 0) / rs.length, unit };
}

/** Mean of the readable states of `list`, rounded to 0.1 without a trailing zero (`meanText`, so 48 reads "48 %" like a single sensor; S23.1: a narrow no-break space before the unit, so a value never wraps between the two), in the unit of the first one read; "" when none is readable.
 *  The one function behind a room's readout on the plan (`renderFloor`), in 3D and in the card's left panel, so they can
 *  never show different numbers. */
export function meanReading(list: string[], state: StateOverlay | undefined): string {
  const m = meanValue(list, state);
  return m ? `${meanText(m.n)}${m.unit ? `\u202F${m.unit}` : ""}` : "";
}

/** S29 (H1): a mean temperature in °C for the colour scale. °C and no unit (a template sensor often has none) as read, °F
 *  converted; any other unit, or no reading, is null: the text still shows, uncoloured. */
export function celsiusOf(v: MeanValue | null): number | null {
  if (!v || !Number.isFinite(v.n)) return null;
  const u = v.unit.trim();
  if (u === "°F" || u === "℉") return ((v.n - 32) * 5) / 9;
  return u === "°C" || u === "℃" || u === "" ? v.n : null;
}

/** S29 (H2): the fixed comfort scale's ends, °C. */
export const HEAT_MIN = 17,
  HEAT_MAX = 25;

/** The card's `heat_min`/`heat_max`: two finite numbers with min < max, else both are the defaults. Untrusted YAML, never a throw. */
export function heatBounds(min: unknown, max: unknown): [number, number] {
  return typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max) && min < max
    ? [min, max]
    : [HEAT_MIN, HEAT_MAX];
}

/** Where `value` (°C) sits on the scale: 0 at `min` or below, 1 at `max` or above. Null for no value or a range that is no range. */
export function heatT(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || !(min < max))
    return null;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
