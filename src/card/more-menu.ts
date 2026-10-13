import { LitElement, html, css, nothing, type PropertyValues } from "lit";

export type MenuItemKind = "radio" | "check" | "action";
export interface MenuItem {
  kind: MenuItemKind;
  label: string;
  /** What the host reads back from `fp-menu-pick`. */
  value?: string;
  /** For `radio` and `check`. The host owns the state: a pick changes nothing here, the host sets `items` again. */
  checked?: boolean;
  disabled?: boolean;
}
export interface MenuSection {
  /** Shown above the section and its accessible name; omit for a section without a heading. */
  label?: string;
  items: MenuItem[];
}

const PANEL_UNDER = 640;
const ENABLED = "[role^=menuitem]:not([aria-disabled=true])";

/**
 * S31.3: `<fp-menu>`, a menu button and its menu, the ⋯ of the card's header. WAI-ARIA menu button: the button has
 * `aria-haspopup="menu"` and `aria-expanded`; the menu holds `menuitemradio`, `menuitemcheckbox` and `menuitem`
 * items in labelled groups. Enter, Space or ArrowDown on the button (or a tap) opens it with focus on the first checked
 * item, else the first; arrows move and wrap, Home and End jump, a disabled item is skipped. A pick fires
 * `fp-menu-pick` (bubbling, composed) with a copy of the item in `detail`, closes the menu and puts focus back on the
 * button. Escape and Tab close it and give focus back to the button, Escape without letting the host's own Escape run
 * (as `<fp-search>`); a press outside closes it.
 *
 * Place: below the button, inside the box of the element that hosts this one (the shadow root's host, else the body).
 * The box is under 640 px wide: the menu is a panel as wide as the box. Otherwise it is as wide as its labels, edge
 * aligned with the button on the side with more room, and clamped into the box. Items are 32 px high, 44 px under
 * `pointer: coarse`; colours only through `--fp-*` (finding 9). Labels are Lit text bindings (finding 2).
 */
export class FpMenu extends LitElement {
  static properties = {
    items: { attribute: false },
    label: { type: String },
    opened: { state: true },
  };
  declare items: MenuSection[];
  /** Accessible name of the button and of the menu. */
  declare label: string;
  private declare opened: boolean;
  private menuId = `fp-menu-${Math.random().toString(36).slice(2)}`;

  constructor() {
    super();
    this.items = [];
    this.label = "More";
    this.opened = false;
  }

  private get btn(): HTMLButtonElement | null { return this.renderRoot?.querySelector("button.btn") ?? null; }
  private get panel(): HTMLElement | null { return this.renderRoot?.querySelector("[role=menu]") ?? null; }
  private enabled(): HTMLElement[] { return [...(this.panel?.querySelectorAll<HTMLElement>(ENABLED) ?? [])]; }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unlisten();
  }

  private listen() {
    document.addEventListener("pointerdown", this.onOutside, true);
    window.addEventListener("resize", this.place);
  }
  private unlisten() {
    document.removeEventListener("pointerdown", this.onOutside, true);
    window.removeEventListener("resize", this.place);
  }

  private onOutside = (ev: Event) => {
    if (!ev.composedPath().includes(this)) this.close(false);
  };

  private open() {
    if (this.opened) return;
    this.opened = true;
    this.listen();
    // Focus and place after the menu is in the DOM.
    void this.updateComplete.then(() => {
      this.place();
      (this.panel?.querySelector<HTMLElement>(`${ENABLED}[aria-checked=true]`) ?? this.enabled()[0] ?? this.panel)?.focus();
    });
  }

  private close(refocus: boolean) {
    if (!this.opened) return;
    this.opened = false;
    this.unlisten();
    if (refocus) this.btn?.focus();
  }

  /** `alt`: Alt was held for the click or the key (S31.6: the Layers items show one family alone, as the chips did). */
  private pick(item: MenuItem, alt = false) {
    if (item.disabled) return;
    this.dispatchEvent(new CustomEvent("fp-menu-pick", { detail: { ...item, alt }, bubbles: true, composed: true }));
    this.close(true);
  }

  protected updated(changed: PropertyValues) {
    if (changed.has("items") && this.opened) this.place();
  }

  /** Below the button, inside the host's box (see the class comment). */
  private place = () => {
    const panel = this.panel;
    const btn = this.btn;
    if (!panel || !btn) return;
    const root = this.getRootNode();
    const inShadow = root instanceof ShadowRoot;
    const box = (inShadow ? root.host : document.body).getBoundingClientRect();
    const host = this.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const bottomLimit = inShadow ? box.bottom : window.innerHeight;
    panel.style.maxHeight = `${Math.max(120, bottomLimit - b.bottom - 8)}px`;
    if (box.width < PANEL_UNDER) {
      panel.style.width = `${box.width}px`;
      panel.style.maxWidth = "none";
      panel.style.left = `${box.left - host.left}px`;
      return;
    }
    panel.style.width = "";
    panel.style.maxWidth = `${box.width}px`;
    panel.style.left = "0px";
    const w = panel.getBoundingClientRect().width;
    const fromLeft = b.left - box.left <= box.right - b.right;
    let x = fromLeft ? b.left : b.right - w;
    x = Math.max(box.left, Math.min(x, box.right - w));
    panel.style.left = `${x - host.left}px`;
  };

  private onButtonKey = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowDown") {
      ev.preventDefault();
      this.open();
    }
  };

  private onMenuKey = (ev: KeyboardEvent) => {
    const list = this.enabled();
    const at = list.indexOf(ev.target as HTMLElement);
    const go = (i: number) => { ev.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    switch (ev.key) {
      case "ArrowDown": go(at + 1); break;
      case "ArrowUp": go(at < 0 ? -1 : at - 1); break;
      case "Home": go(0); break;
      case "End": go(list.length - 1); break;
      case "Escape":
        // The host's own Escape (deselect, close the sheet) must not also run.
        ev.preventDefault();
        ev.stopPropagation();
        this.close(true);
        break;
      case "Tab":
        ev.preventDefault();
        this.close(true);
        break;
      case "Enter":
      case " ": {
        const item = this.flat()[Number((ev.target as HTMLElement).dataset.i)];
        if (item) { ev.preventDefault(); this.pick(item, ev.altKey); }
        break;
      }
    }
  };

  private flat(): MenuItem[] {
    return this.sections().flatMap((s) => s.items);
  }

  /** `items` is the host's data: anything that is not a section with an array of items is skipped. */
  private sections(): MenuSection[] {
    return (Array.isArray(this.items) ? this.items : []).filter((s) => s && Array.isArray(s.items));
  }

  private itemRole(kind: MenuItemKind) {
    return kind === "radio" ? "menuitemradio" : kind === "check" ? "menuitemcheckbox" : "menuitem";
  }

  render() {
    let n = 0;
    return html`
      <button
        type="button"
        class="btn"
        aria-haspopup="menu"
        aria-expanded=${this.opened ? "true" : "false"}
        aria-controls=${this.opened ? this.menuId : nothing}
        aria-label=${this.label}
        @click=${() => (this.opened ? this.close(true) : this.open())}
        @keydown=${this.onButtonKey}
      ><span aria-hidden="true">⋯</span></button>
      ${this.opened ? html`
        <div id=${this.menuId} role="menu" aria-label=${this.label} tabindex="-1" @keydown=${this.onMenuKey}>
          ${this.sections().map((s) => html`
            <div class="group" role="group" aria-label=${s.label ?? nothing}>
              ${s.label ? html`<div class="gl" aria-hidden="true">${s.label}</div>` : nothing}
              ${s.items.map((it) => {
                const i = n++;
                const withState = it.kind === "radio" || it.kind === "check";
                const on = withState && !!it.checked;
                return html`<div
                  class="item${on ? " on" : ""}${it.kind === "radio" ? " radio" : ""}"
                  role=${this.itemRole(it.kind)}
                  aria-checked=${withState ? (on ? "true" : "false") : nothing}
                  aria-disabled=${it.disabled ? "true" : nothing}
                  tabindex="-1"
                  data-i=${i}
                  data-value=${it.value ?? nothing}
                  @click=${(ev: MouseEvent) => this.pick(it, ev.altKey)}
                ><span class="mark${on ? " on" : ""}" aria-hidden="true"></span><span class="text">${it.label}</span></div>`;
              })}
            </div>`)}
        </div>` : nothing}
    `;
  }

  static styles = css`
    :host{display:inline-block;position:relative;box-sizing:border-box;font:13px/1.3 var(--fp-font, system-ui, sans-serif)}
    .btn{font:inherit;color:var(--fp-ink);background:var(--fp-room);border:1px solid var(--fp-idle);border-radius:6px;
      min-width:32px;min-height:32px;padding:0 8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
    [role=menu]{position:absolute;z-index:50;top:calc(100% + 4px);left:0;box-sizing:border-box;min-width:200px;width:max-content;
      overflow:auto;max-height:min(70vh,520px);padding:2px;color:var(--fp-ink);background:var(--fp-bg);border:1px solid var(--fp-idle);border-radius:6px;
      box-shadow:0 4px 16px color-mix(in srgb, var(--fp-ink) 25%, transparent)}
    [role=menu]:focus{outline:none}
    .group + .group{border-top:1px solid color-mix(in srgb, var(--fp-ink) 20%, transparent);margin-top:2px;padding-top:2px}
    .gl{padding:4px 8px 2px;font-size:.75em;opacity:.7}
    .item{display:flex;align-items:center;gap:8px;box-sizing:border-box;min-height:32px;padding:0 8px;cursor:pointer;
      border-radius:4px;color:var(--fp-ink);background:transparent}
    .item:hover{background:color-mix(in srgb, var(--fp-ink) 14%, transparent)}
    .item:focus{outline:none;background:var(--fp-ink);color:var(--fp-bg)}
    .item[aria-disabled=true]{opacity:.5;cursor:default}
    .mark{flex:none;width:1.2em;text-align:center}
    .mark.on::before{content:"✓"}
    .radio .mark.on::before{content:"●"}
    .text{min-width:0;overflow-wrap:anywhere}
    @media (pointer:coarse){
      .btn{min-width:44px;min-height:44px}
      .item{min-height:44px}
    }
  `;
}

if (!customElements.get("fp-menu")) customElements.define("fp-menu", FpMenu);

declare global {
  interface HTMLElementTagNameMap { "fp-menu": FpMenu }
}
