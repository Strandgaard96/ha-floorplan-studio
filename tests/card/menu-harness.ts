import { FLOORPLAN_CSS } from "../../src/core/render";
import type { FpMenu, MenuSection } from "../../src/card/more-menu";

const q = new URLSearchParams(location.search);
const style = document.createElement("style");
style.textContent = `${FLOORPLAN_CSS} body{margin:0;font:14px system-ui,sans-serif}`;
document.head.appendChild(style);

const card = document.getElementById("card")!;
card.dataset.theme = q.get("theme") ?? "light";
card.style.cssText = `width:${q.get("w") ?? "800"}px;height:${q.get("h") ?? "520"}px;margin:20px;position:relative;box-sizing:border-box;background:var(--fp-bg);color:var(--fp-ink);overflow:hidden`;
const root = card.attachShadow({ mode: "open" });
root.innerHTML = `
  <style>
    header{display:flex;justify-content:space-between;align-items:center;padding:8px}
    .plan{padding:40px 8px}
  </style>
  <header><fp-menu id="left" label="Look"></fp-menu><button id="mid">Mid</button><fp-menu id="right" label="More"></fp-menu></header>
  <p class="plan">Plan stand-in</p>`;

const look: MenuSection[] = [
  { label: "View", items: [
    { kind: "radio", label: "2D", value: "2d", checked: false },
    { kind: "radio", label: "2.5D", value: "25d", checked: true },
    { kind: "radio", label: "3D", value: "3d", checked: false },
  ] },
  { label: "Plan", items: [
    { kind: "check", label: "Labels", value: "labels", checked: true },
    { kind: "check", label: "Walls", value: "walls", checked: false, disabled: true },
    { kind: "action", label: "Reset view", value: "reset" },
  ] },
];
// Nothing checked, a hostile label (finding 2) and a long one.
const plain: MenuSection[] = [
  { items: [
    { kind: "action", label: '"><script>window.__xss=1</script>', value: "x" },
    { kind: "action", label: "A very long label that has to be cut or wrapped and must never push the menu out of its card", value: "long" },
    { kind: "check", label: "Last", value: "last", checked: false },
  ] },
];

// ?many=1: the left menu has forty items, more than any viewport the review tested, so it has to scroll.
if (q.get("many")) look.push({ label: "Many", items: Array.from({ length: 40 }, (_, i) => ({ kind: "action" as const, label: `Item ${i + 1}`, value: `i${i + 1}` })) });

const w = window as unknown as { picks: { detail: unknown; target: string; bubbles: boolean; composed: boolean }[]; ready: boolean };
w.picks = [];
root.addEventListener("fp-menu-pick", (ev) => {
  const e = ev as CustomEvent;
  w.picks.push({ detail: e.detail, target: (e.target as HTMLElement).id, bubbles: e.bubbles, composed: e.composed });
});
customElements.whenDefined("fp-menu").then(() => {
  (root.getElementById("left") as unknown as FpMenu).items = look;
  (root.getElementById("right") as unknown as FpMenu).items = plain;
  w.ready = true;
});
import "../../src/card/more-menu";
