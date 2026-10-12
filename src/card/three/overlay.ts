// The HTML layer over the 3D canvas (S12.5): the room names and readouts, and one icon per device, each at a point of the
// model that the view projects to the screen whenever the camera or the size changes. The icons are the plan's own markup
// (core/live.ts hands the inner SVG, classes and custom properties the plan writes), so the card's stylesheet colours them
// and 2D and 3D cannot differ. The whole layer is `pointer-events:none`: the canvas under it takes every pointer, and a tap on
// an icon is answered by `hit()` through the same `pick` a tap anywhere else gets (DECISIONS S12.5). Nothing is imported from
// core at run time (types only). Every string that reaches the DOM goes through textContent or setAttribute, never markup,
// except the icon's inner SVG, which core builds from its own inlined table (CLAUDE.md finding 2).
import type { Live3D } from "../../core/live";
import type { RoomKind } from "../../core/schema";
import { declutter, type Box } from "./declutter";

type P3 = readonly [number, number, number];
/** `roomInfo` (optional) says what each room is and how large, for the label priority (S28.11): a room over a garden, a garden over water. */
export interface Anchors {
  devices: Map<number, P3>;
  rooms: Map<number, P3>;
  roomInfo?: Map<number, { kind: string; area: number }>;
}
/** Where a point is on the screen (px from the layer's top left), and whether it is in front of the camera at all. */
export type Projector = (p: P3) => { x: number; y: number; front: boolean };

const NS = "http://www.w3.org/2000/svg";
/** px. An icon is a 32 px box (the plan's halo is 32 units across); a tap lands on it within this radius of its centre. */
const ICON_PX = 32,
  HIT_PX = 16;
/** S28.11. A label that loses to another fades out; the answer is taken once the camera has been still this long (ms), never mid-drag. */
const SETTLE_MS = 160,
  LEAD = 1;
/** Who keeps the room when boxes meet: a device icon, then a room's name (a room over a garden over water), its readout, a device's value, its name. */
const P_ICON = 100,
  P_ROOM = 80,
  P_ZONE = 75,
  P_GARDEN = 70,
  P_PAVEMENT = 65,
  P_WATER = 60,
  P_FILL = 55,
  P_READOUT = 50,
  P_VALUE = 30,
  P_DNAME = 20;
/** One rank per room kind (a Record, so a new kind fails to compile). Indoor names (room, structure) win; a zone is a named area on top of rooms, just under them; outdoor ground (garden, terrace) is
 *  next, then pavement and water; a fill is decoration and ranks last of the names, still over a readout. */
export const ROOM_PRIORITY: Record<RoomKind, number> = {
  room: P_ROOM,
  structure: P_ROOM,
  zone: P_ZONE,
  garden: P_GARDEN,
  terrace: P_GARDEN,
  pavement: P_PAVEMENT,
  water: P_WATER,
  fill: P_FILL,
};
/** The rank of a room's name. The kind comes from layout data, so an unknown one ranks as a room. */
export const roomPriority = (kind: string): number =>
  Object.prototype.hasOwnProperty.call(ROOM_PRIORITY, kind) ? ROOM_PRIORITY[kind as RoomKind] : P_ROOM;
// UI refactor item 9, in the stylesheet below: in 3D an idle device is a control, not clutter. It is the lit marker's size, an opaque
// --fp-disc disc with a thin --fp-idle edge (so it reads on a white floor, a dark one and the ground) and its glyph at full opacity.
// `inkFor` makes --fp-idle at least INK_RATIO against the disc on this layer, in any theme. The plan's own idle look (core/render.ts:
// no disc, a .7 glyph) is for 2D, where the floor is one flat colour; these rules win by specificity, and only in this layer.
/** Item 10: a label is a chip on the 2D plan's tag colour (`.lbl-tag`, --fp-outline). A device's value and its name stack one chip apart:
 *  12 px text at line-height 1.2 is 14.4 px, plus 1 px padding above and below, plus a 2 px gap. */
const CHIP_GAP = 2,
  CHIP_STEP = 19;
const CSS = `.fp3-ov{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.fp3-ov *{pointer-events:none}
.fp3-dev,.fp3-rm{position:absolute;left:0;top:0;will-change:transform}
.fp3-dev{width:0;height:0}
.fp3-ic{position:absolute;left:-${ICON_PX / 2}px;top:-${ICON_PX / 2}px;width:${ICON_PX}px;height:${ICON_PX}px;overflow:visible}
.fp3-ic g.dev:not(.on):not(.danger):not(.unavailable) .halo{fill:var(--fp-disc);fill-opacity:1;stroke:var(--fp-idle);stroke-width:1}
.fp3-ic g.dev:not(.on):not(.danger):not(.unavailable) path{fill-opacity:1}
.fp3-dv,.fp3-dn{position:absolute;left:0;transform:translateX(-50%);white-space:nowrap;font:12px/1.2 var(--fp-font,system-ui,sans-serif)}
.fp3-dv{top:${ICON_PX / 2 + 1}px}
.fp3-dn{top:${ICON_PX / 2 + 1 + CHIP_STEP}px}
.fp3-dv,.fp3-dn,.fp3-name,.fp3-val{color:var(--fp-text);background:var(--fp-outline);border-radius:3px;padding:1px 5px}
.fp3-rm{display:flex;flex-direction:column;align-items:center;gap:${CHIP_GAP}px;text-align:center;white-space:nowrap;font:600 14px/1.25 var(--fp-font,system-ui,sans-serif)}
.fp3-name,.fp3-val{display:block}
.fp3-val{font-weight:400;font-size:12px}
.fp3-ic,.fp3-dv,.fp3-dn,.fp3-name,.fp3-val{transition:opacity .12s linear}
.fp3-ov .fp3-lose{opacity:0}
@media (prefers-reduced-motion:reduce){.fp3-ic,.fp3-dv,.fp3-dn,.fp3-name,.fp3-val{transition:none}}
.fp3-val .val-pill{display:inline-block;padding:0 4px;margin:0 -2px;border-radius:999px;background:color-mix(in srgb,var(--fp-temp) 35%,transparent)}
.fp3-ic g.dev:not(.on):not(.danger):not(.unavailable) .halo.heat{stroke:var(--fp-temp);stroke-width:2}`;

/** The least contrast (WCAG ratio) the idle glyph and the disc's edge keep against the disc: 3 is the rule, this leaves a margin. */
const INK_RATIO = 3.3;
/** The colours an idle glyph is filled with (the plan's idle grey, a camera's, an outdoor device's). */
const INK_VARS = ["--fp-idle", "--fp-dev-camera", "--fp-dev-garden"];
type RGB = [number, number, number];
/** A computed colour (`rgb(...)`, `rgba(...)` or `color(srgb r g b)`) as 0..255 channels, or null. */
export function parseRgb(c: string): RGB | null {
  const m = /^(rgba?|color)\(\s*(?:srgb\s+)?([^)]*)\)$/.exec(c.trim());
  if (!m) return null;
  const v = m[2]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number),
    k = m[1] === "color" ? 255 : 1;
  return v.length === 3 && v.every(Number.isFinite) ? (v.map((x) => x * k) as RGB) : null;
}
const lum = (c: RGB) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/**
 * The idle ink to draw on `disc`: `idle` itself when it already keeps INK_RATIO against the disc, else `idle` pushed toward black (a light
 * disc) or white (a dark one) a step at a time until it does. Null says keep the theme's own idle colour. Pure.
 */
export function inkFor(idle: RGB, disc: RGB): RGB | null {
  if (ratio(idle, disc) >= INK_RATIO) return null;
  const end: RGB = lum(disc) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = idle.map((v, i) => Math.round(v + (end[i] - v) * t)) as RGB;
    if (ratio(c, disc) >= INK_RATIO) return c;
  }
  return end;
}

interface Item {
  el: HTMLElement;
  at: P3;
  sig: string;
  shown: boolean;
  x: number;
  y: number;
}
const LOSE = "fp3-lose";

export function createOverlay(container: HTMLElement) {
  const root = document.createElement("div");
  root.className = "fp3-ov";
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  container.appendChild(root);
  const icons = new Map<
      number,
      Item & { svg: SVGSVGElement; g: SVGGElement; dv: HTMLElement | null; dn: HTMLElement | null }
    >(),
    rooms = new Map<number, Item & { name: HTMLElement; val: HTMLElement; kind: string; area: number }>();
  /** Measured size of an element (px), kept until its text changes: reading it is a layout, so it is done once, not per frame. */
  const sizes = new Map<Element, [number, number]>();
  // A 0 x 0 answer means the element is not laid out yet (hidden card, no font), so it is not kept: it is measured again next time.
  const sizeOf = (e: HTMLElement): [number, number] => {
    let s = sizes.get(e);
    if (!s) {
      const r = e.getBoundingClientRect();
      s = [r.width, r.height];
      if (r.width > 0 || r.height > 0) sizes.set(e, s);
    }
    return s;
  };
  // The declutter: `dirty` is set by anything that can change the answer, `lastMove` by a label that moved on the screen.
  let dirty = false,
    decided = false,
    lastMove = 0,
    timer: ReturnType<typeof setTimeout> | null = null,
    gone = false;
  // A pointer held down on the view is a drag (or a pinch) in progress: nothing is decided until it is up, however slow a frame is.
  const down = new Set<number>();
  const onDown = (e: PointerEvent) => {
    down.add(e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    if (down.delete(e.pointerId) && !down.size) {
      lastMove = performance.now();
      if (dirty) arm(SETTLE_MS);
    }
  };
  // A pointer can end without a pointerup reaching the window: its capture is lost, or the tab is hidden mid-drag. Either lets go of everything held.
  const onLost = (e: Event) => onUp(e as PointerEvent);
  const onHide = () => {
    if (document.hidden && down.size) {
      down.clear();
      lastMove = performance.now();
      if (dirty) arm(SETTLE_MS);
    }
  };
  // A web font that arrives after the first decision changes every text width: measure again.
  const onFonts = () => {
    sizes.clear();
    dirty = true;
    arm(SETTLE_MS);
  };
  container.addEventListener("pointerdown", onDown, true);
  container.addEventListener("lostpointercapture", onLost, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  document.addEventListener("visibilitychange", onHide);
  document.fonts?.addEventListener?.("loadingdone", onFonts);
  // The idle ink (item 9): this layer's --fp-idle is the theme's own unless that is too faint on the theme's disc. Measured again when the
  // theme's colours change (the key), never per frame.
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  container.appendChild(probe); // beside the layer, not in it: the layer's own --fp-idle is what this measures against
  let inkKey = "";
  const refreshInk = () => {
    const colour = (v: string) => {
      probe.style.color = "";
      probe.style.color = v;
      return getComputedStyle(probe).color;
    };
    const disc = colour("var(--fp-disc)"),
      key = [disc, ...INK_VARS.map((v) => colour(`var(${v})`))].join("|");
    if (key === inkKey) return;
    inkKey = key;
    const d = parseRgb(disc);
    for (const v of INK_VARS) {
      const c = parseRgb(colour(`var(${v})`)),
        ink = c && d ? inkFor(c, d) : null;
      if (ink) root.style.setProperty(v, `rgb(${ink.join(",")})`);
      else root.style.removeProperty(v);
    }
  };
  const text = (cls: string, s: string) => {
    const e = document.createElement("span");
    e.className = cls;
    e.textContent = s;
    return e;
  };

  /** Brings the elements in line with the live state: made, changed or removed in place. A change of nothing writes nothing. */
  function set(live: Live3D, anchors: Anchors) {
    refreshInk();
    const seenD = new Set<number>(),
      seenR = new Set<number>();
    anchors.devices.forEach((a, i) => {
      const d = live.devices[i];
      if (!d) return;
      seenD.add(i);
      const at: P3 = d.at ? [d.at[0], a[1], d.at[1]] : a; // a person's room sensor puts the icon at the room's centre, as in 2D
      let it = icons.get(i);
      if (!it) {
        const el = document.createElement("div"),
          svg = document.createElementNS(NS, "svg"),
          g = document.createElementNS(NS, "g");
        el.className = "fp3-dev";
        el.style.visibility = "hidden"; // until `place` has put it somewhere
        svg.setAttribute("class", "fp3-ic");
        svg.setAttribute("data-i", String(i));
        svg.setAttribute("viewBox", "-4 -4 32 32");
        svg.appendChild(g);
        el.appendChild(svg);
        root.appendChild(el);
        icons.set(i, (it = { el, svg, g, dv: null, dn: null, at, sig: "", shown: false, x: NaN, y: NaN }));
        dirty = true;
      }
      if (it.at[0] !== at[0] || it.at[1] !== at[1] || it.at[2] !== at[2]) dirty = true;
      it.at = at;
      const sig = [d.klass, d.style, d.icon].join("\u0000");
      if (sig !== it.sig) {
        it.sig = sig;
        it.g.setAttribute("class", d.klass);
        it.g.setAttribute("style", d.style);
        it.g.innerHTML = d.icon;
      }
      const val = live.labels ? d.value : "",
        name = live.labels && live.names ? d.name : "";
      if (val) {
        if (!it.dv) {
          it.dv = text("fp3-dv", "");
          it.el.appendChild(it.dv);
          dirty = true;
        }
        if (it.dv.textContent !== val) {
          it.dv.textContent = val;
          sizes.delete(it.dv);
          dirty = true;
        }
      } else if (it.dv) {
        sizes.delete(it.dv);
        it.dv.remove();
        it.dv = null;
        dirty = true;
      }
      if (name) {
        if (!it.dn) {
          it.dn = text("fp3-dn", "");
          it.el.appendChild(it.dn);
          dirty = true;
        }
        if (it.dn.textContent !== name) {
          it.dn.textContent = name;
          sizes.delete(it.dn);
          dirty = true;
        }
      } else if (it.dn) {
        sizes.delete(it.dn);
        it.dn.remove();
        it.dn = null;
        dirty = true;
      }
      if (it.dn) it.dn.style.top = `${ICON_PX / 2 + (val ? 1 + CHIP_STEP : 1)}px`;
    });
    for (const [i, it] of icons)
      if (!seenD.has(i)) {
        it.el.remove();
        icons.delete(i);
        dirty = true;
      }
    if (live.labels) {
      anchors.rooms.forEach((a, r) => {
        const lr = live.rooms[r];
        if (!lr || (!lr.name && !lr.readout)) return;
        seenR.add(r);
        let it = rooms.get(r);
        if (!it) {
          const el = document.createElement("div"),
            name = text("fp3-name", ""),
            val = text("fp3-val", "");
          el.className = "fp3-rm";
          el.style.visibility = "hidden";
          el.setAttribute("data-r", String(r));
          el.append(name, val);
          root.appendChild(el);
          rooms.set(r, (it = { el, name, val, at: a, sig: "", shown: false, x: NaN, y: NaN, kind: "room", area: 0 }));
          dirty = true;
        }
        const info = anchors.roomInfo?.get(r);
        it.kind = info?.kind ?? "room";
        it.area = info?.area ?? 0;
        if (it.at[0] !== lr.at[0] || it.at[2] !== lr.at[1]) dirty = true;
        it.at = [lr.at[0], a[1], lr.at[1]];
        const sig = `${lr.name}\u0000${lr.readout}\u0000${lr.heat ?? ""}`;
        if (sig !== it.sig) {
          it.sig = sig;
          it.name.textContent = lr.name;
          // S29 (H6): the temperature on a pill whose colour the card's stylesheet mixes from --fp-temp-t; the rest stays plain text.
          if (lr.heat !== null && lr.heat !== undefined && lr.temp) {
            const pill = text("val-pill", lr.temp);
            pill.style.setProperty("--fp-temp-t", String(lr.heat));
            it.val.replaceChildren(pill, ...(lr.rest ? [document.createTextNode(` · ${lr.rest}`)] : []));
          } else it.val.textContent = lr.readout;
          it.name.hidden = !lr.name;
          it.val.hidden = !lr.readout;
          sizes.delete(it.el);
          sizes.delete(it.name);
          sizes.delete(it.val);
          dirty = true;
        }
      });
    }
    for (const [r, it] of rooms)
      if (!seenR.has(r)) {
        it.el.remove();
        rooms.delete(r);
        dirty = true;
      }
  }

  /** Moves every element to where its point is on the screen, and hides the ones that are behind the camera, off the view or behind a wall. */
  function place(project: Projector, blocked: (p: P3) => boolean, w: number, h: number) {
    let moved = false;
    const put = (it: Item, centred: boolean) => {
      const s = project(it.at),
        shown =
          s.front && s.x > -ICON_PX && s.x < w + ICON_PX && s.y > -ICON_PX && s.y < h + ICON_PX && !blocked(it.at);
      if (shown !== it.shown) {
        it.shown = shown;
        it.el.style.visibility = shown ? "" : "hidden";
        dirty = true;
      }
      if (shown && (Math.abs(s.x - it.x) > 0.05 || Math.abs(s.y - it.y) > 0.05 || Number.isNaN(it.x))) {
        moved = true;
        it.x = s.x;
        it.y = s.y;
        it.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)${centred ? " translate(-50%,-50%)" : ""}`;
      }
    };
    for (const it of icons.values()) put(it, false);
    for (const it of rooms.values()) put(it, true);
    if (moved) {
      lastMove = performance.now();
      dirty = true;
    }
    // The first answer is at once (nothing is on show before it); later ones wait for the camera to be still, so no label flips mid-drag.
    if (!decided) {
      if (dirty) decide();
    } else if (dirty) {
      if (!down.size && performance.now() - lastMove >= SETTLE_MS) decide();
      else arm(SETTLE_MS);
    }
  }

  const arm = (ms: number) => {
    if (!timer && !gone)
      timer = setTimeout(() => {
        timer = null;
        if (!dirty) return;
        const wait = SETTLE_MS - (performance.now() - lastMove);
        if (down.size || wait > 0) arm(down.size ? SETTLE_MS : wait);
        else decide();
      }, ms);
  };
  /** Every label on show, with its box on the screen: the icon, a device's value and name, a room's name and readout. */
  function decide() {
    dirty = false;
    decided = true;
    const boxes: Box[] = [],
      els: Element[] = [];
    const add = (
      e: Element | null,
      x: number,
      y: number,
      w: number,
      h: number,
      priority: number,
      area: number,
      index: number,
    ) => {
      if (!e) return;
      els.push(e);
      // A line of text is taller than its glyphs: its box leaves `LEAD` px of leading at the top and the bottom, so a device's value
      // and name, which are stacked one under the other, and the icon above them, do not count as meeting.
      const lead = priority === P_ICON ? 0 : LEAD;
      boxes.push({ x, y: y + lead, w, h: Math.max(0, h - 2 * lead), priority, area, index });
    };
    for (const [i, it] of icons) {
      if (!it.shown) continue;
      add(it.svg, it.x - ICON_PX / 2, it.y - ICON_PX / 2, ICON_PX, ICON_PX, P_ICON, 0, i);
      if (it.dv) {
        const [w, h] = sizeOf(it.dv);
        add(it.dv, it.x - w / 2, it.y + ICON_PX / 2 + 1, w, h, P_VALUE, 0, i);
      }
      if (it.dn) {
        const [w, h] = sizeOf(it.dn);
        add(it.dn, it.x - w / 2, it.y + ICON_PX / 2 + (it.dv ? 1 + CHIP_STEP : 1), w, h, P_DNAME, 0, i);
      }
    }
    // A room's name and readout are two chips, each its own width, centred on the label's point.
    const roomEls = new Map<number, { name: number; val: number }>();
    for (const [r, it] of rooms) {
      if (!it.shown) continue;
      const [, h] = sizeOf(it.el),
        [nw, nh] = it.name.hidden ? [0, 0] : sizeOf(it.name),
        [vw, vh] = it.val.hidden ? [0, 0] : sizeOf(it.val),
        top = it.y - h / 2,
        pair = { name: -1, val: -1 };
      if (!it.name.hidden) {
        pair.name = els.length;
        add(it.name, it.x - nw / 2, top, nw, nh, roomPriority(it.kind), it.area, r);
      }
      if (!it.val.hidden) {
        pair.val = els.length;
        add(it.val, it.x - vw / 2, top + (nh ? nh + CHIP_GAP : 0), vw, vh, P_READOUT, it.area, r);
      }
      roomEls.set(r, pair);
    }
    const keep = declutter(boxes);
    // 11b: a room's readout never outlives its name. The name outranks it, so a marker over the name leaves the readout the only chip
    // of the room standing; it goes too (the readout is dropped first, never the name).
    for (const { name, val } of roomEls.values()) if (name >= 0 && val >= 0 && !keep[name]) keep[val] = false;
    els.forEach((e, k) => e.classList.toggle(LOSE, !keep[k]));
  }

  return {
    set,
    place,
    /** The device whose icon is under (x, y) in the layer's pixels, the nearest one within `HIT_PX`, or null. Hidden icons do not count. */
    hit(x: number, y: number): number | null {
      let best: number | null = null,
        d2 = HIT_PX * HIT_PX;
      for (const [i, it] of icons) {
        if (!it.shown || it.svg.classList.contains(LOSE)) continue;
        const d = (it.x - x) ** 2 + (it.y - y) ** 2;
        if (d <= d2) {
          d2 = d;
          best = i;
        }
      }
      return best;
    },
    /** What an icon is filled with now, as the browser computes it from the card's own stylesheet: a CSS colour and an opacity 0..1. */
    fill(i: number): { css: string; opacity: number } | null {
      const it = icons.get(i),
        path = it?.g.querySelector("path");
      if (!it || !path) return null;
      const op = (e: Element) => {
        const v = parseFloat(getComputedStyle(e).opacity);
        return Number.isFinite(v) ? v : 1;
      };
      // S23.4: an on device is a solid disc with an ink glyph, so its colour is the disc's. Off has no disc and the glyph is
      // the colour; a ball in the glyph's own grey hid the glyph drawn over it, so an off ball takes the disc colour
      // (--fp-disc: white on light themes, dark on blueprint) and the grey glyph reads on it.
      const halo = it.g.querySelector(".halo");
      if (halo && parseFloat(getComputedStyle(halo).fillOpacity) > 0)
        return { css: getComputedStyle(halo).fill, opacity: op(it.g) * op(halo) };
      return { css: getComputedStyle(halo ?? path).fill, opacity: op(it.g) * op(path) };
    },
    /** Test and debug: which devices and rooms have an element, and whether it is on show. */
    state: () => ({
      icons: [...icons].map(([i, it]) => ({ i, shown: it.shown, kept: !it.svg.classList.contains(LOSE) })),
      rooms: [...rooms].map(([r, it]) => ({ r, shown: it.shown, kept: !it.name.classList.contains(LOSE) })),
    }),
    dispose() {
      gone = true;
      if (timer) clearTimeout(timer);
      timer = null;
      container.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      container.removeEventListener("lostpointercapture", onLost, true);
      document.removeEventListener("visibilitychange", onHide);
      document.fonts?.removeEventListener?.("loadingdone", onFonts);
      root.remove();
      probe.remove();
      icons.clear();
      rooms.clear();
      sizes.clear();
    },
  };
}
