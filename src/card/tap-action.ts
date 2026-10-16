// S33.3, spec X2: the card's `tap_action` and `hold_action`, read for device icons. The YAML is untrusted (a person or
// a model wrote it), so a reader never throws and never trusts a shape. Only four tap actions and two hold actions
// exist; every other Home Assistant action (navigate, url, perform-action, ...) means one target per card, which a
// plan of 400 devices is not, so it reads as absent and `warn` is true: the card says so once.

export type TapAction = "popup" | "more-info" | "toggle" | "none";
export type HoldAction = "more-info" | "none";

export interface ActionRead<A> {
  action: A;
  /** The key was there but not usable. Absent is the default and is not a warning. */
  warn: boolean;
}

const TAP: readonly string[] = ["popup", "more-info", "toggle", "none"];
const HOLD: readonly string[] = ["more-info", "none"];

// A string is the action; an object's `action` is the action. A getter or proxy that throws is junk.
function actionName(raw: unknown): string | null {
  try {
    if (typeof raw === "string") return raw;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const a = (raw as { action?: unknown }).action;
    return typeof a === "string" ? a : null;
  } catch {
    return null;
  }
}

function read<A extends string>(raw: unknown, known: readonly string[], fallback: A): ActionRead<A> {
  if (raw === undefined || raw === null) return { action: fallback, warn: false };
  const name = actionName(raw);
  if (name !== null && known.includes(name)) return { action: name as A, warn: false };
  return { action: fallback, warn: true };
}

export function tapActionOf(raw: unknown): ActionRead<TapAction> {
  return read<TapAction>(raw, TAP, "popup");
}

export function holdActionOf(raw: unknown): ActionRead<HoldAction> {
  return read<HoldAction>(raw, HOLD, "more-info");
}
