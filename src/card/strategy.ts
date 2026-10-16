import { migrate, validate } from "../core";

/**
 * S33.9: the Lovelace dashboard the `floorplan-studio` strategy builds (docs/specs/extras-s33.md, X4). Pure: no
 * element, no network. Everything it reads is untrusted (the load reply, the layout, the strategy's YAML), so it
 * never throws and a title is only ever placed in the result as data, never as HTML.
 *
 * `result` is the reply of `floorplan_studio/load`, `{ layout }` (shape copied from websocket.py; `layout` is null
 * until the Studio has saved once), or a failed load as `{ error }` or an Error.
 */
export interface StrategyCard {
  type: string;
  [key: string]: unknown;
}
export interface StrategyView {
  title: string;
  path: string;
  panel?: boolean;
  cards: StrategyCard[];
}
export interface StrategyDashboard {
  title: string;
  views: StrategyView[];
}

const CARD_TYPE = "custom:floorplan-studio-card";
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const slug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** S33 review: text copied from a layout or an error into a markdown card. Home Assistant renders markdown content as a Jinja template, so `{` and `}` become entities (no `{{ }}` or `{% %}` survives), and `<`, `>` and `&` do too (no tag, no entity read as typed). */
const esc = (t: string): string => t.replace(/[&<>{}]/g, (c) => `&#${c.charCodeAt(0)};`);
/** At most 10 error lines, then how many more. */
const MAX_LISTED = 10;
const listErrors = (errors: string[]): string => {
  const shown = errors.slice(0, MAX_LISTED).map((e) => `- ${esc(e)}`);
  if (errors.length > MAX_LISTED) shown.push(`... and ${errors.length - MAX_LISTED} more`);
  return shown.join("\n");
};

/** One view with one markdown card that says what failed and what to do. */
function problem(title: string, lines: string[]): StrategyDashboard {
  return {
    title,
    views: [{ title, path: "floorplan", panel: true, cards: [{ type: "markdown", content: lines.join("\n\n") }] }],
  };
}

const reason = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (isObj(e) && typeof e.message === "string") return e.message;
  return typeof e === "string" ? e : "";
};

export function dashboardFor(result: unknown, config: unknown): StrategyDashboard {
  try {
    const cfg = isObj(config) ? config : {};
    const title = typeof cfg.title === "string" && cfg.title.trim() ? cfg.title : "Floorplan";

    const failed = result instanceof Error || (isObj(result) && result.error !== undefined && result.error !== null);
    if (failed) {
      const why = esc(reason(result instanceof Error ? result : (result as Record<string, unknown>).error));
      return problem(title, [
        `**The floor plan could not be loaded.**${why ? ` ${why}` : ""}`,
        "Check that the Floorplan Studio integration is installed and set up (Settings, Devices & services), then reload this dashboard.",
      ]);
    }
    const raw = isObj(result) ? result.layout : undefined;
    if (raw === undefined || raw === null) {
      return problem(title, [
        "**There is no floor plan yet.**",
        "Open the Floorplan Studio panel, draw your floors and press Save once. Then reload this dashboard.",
      ]);
    }
    let migrated;
    try {
      migrated = migrate(raw);
    } catch (e) {
      return problem(title, [
        "**The saved floor plan is not valid.**",
        `- ${esc(reason(e))}`,
        "Open it in the Floorplan Studio, fix it and Save again.",
      ]);
    }
    const checked = validate(migrated);
    if (!checked.ok) {
      return problem(title, [
        "**The saved floor plan is not valid.**",
        listErrors(checked.errors),
        "Open it in the Floorplan Studio, fix it and Save again.",
      ]);
    }

    // `__proto__` and the two fixed keys never come from the YAML: type and floor are the strategy's.
    const extra: [string, unknown][] = isObj(cfg.card)
      ? Object.entries(cfg.card).filter(([k]) => k !== "type" && k !== "floor" && k !== "__proto__")
      : [];
    const used = new Set<string>();
    const views: StrategyView[] = Object.entries(checked.layout.floors).map(([key, floor]) => {
      const base = slug(key) || "floor";
      let path = base;
      for (let n = 2; used.has(path); n++) path = `${base}-${n}`;
      used.add(path);
      const card: StrategyCard = { type: CARD_TYPE, floor: key };
      // defineProperty, not assignment: an option named `__proto__` or the like stays an own property.
      for (const [k, v] of extra)
        Object.defineProperty(card, k, { value: v, enumerable: true, writable: true, configurable: true });
      const t = typeof floor.title === "string" && floor.title.trim() ? floor.title : key;
      return { title: t, path, panel: true, cards: [card] };
    });
    return views.length
      ? { title, views }
      : problem(title, ["**The floor plan has no floors.**", "Open the Floorplan Studio and add one."]);
  } catch {
    return problem("Floorplan", [
      "**The dashboard could not be built.**",
      "Reload it. If it persists, open the Floorplan Studio and Save again.",
    ]);
  }
}

/** The strategy's one call, as Home Assistant makes it: `static async generate(config, hass)` on the element. It asks the
 * integration for the layout (`floorplan_studio/load`, reply `{ layout }`) and hands the reply, or the failure, to
 * `dashboardFor`. A missing `hass`, a connection without `sendMessagePromise`, a rejection and a throw are all a failed load:
 * this never rejects, so the dashboard always has something to show. */
export async function generate(config: unknown, hass: unknown): Promise<StrategyDashboard> {
  let result: unknown;
  try {
    const conn = isObj(hass) ? hass.connection : undefined;
    const send = isObj(conn) ? conn.sendMessagePromise : undefined;
    if (typeof send !== "function") result = { error: "Home Assistant's connection was not available." };
    else result = await (send as (m: unknown) => Promise<unknown>).call(conn, { type: "floorplan_studio/load" });
  } catch (e) {
    result = { error: e ?? "The load failed." };
  }
  return dashboardFor(result, config);
}

/** The element Home Assistant looks up as `ll-strategy-dashboard-floorplan-studio`, for `strategy: { type: custom:floorplan-studio }`.
 * Built on call, not at import, so this module stays loadable where there is no DOM. */
export function strategyElement(): CustomElementConstructor {
  return class FloorplanStudioStrategy extends HTMLElement {
    static generate = generate;
  };
}
