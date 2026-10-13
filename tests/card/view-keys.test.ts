import { describe, expect, it } from "vitest";
import { isSaveChord, planKeyFor, takesSpace, takesTyping, viewKeyFor, viewKeyOf } from "../../src/card/view-keys";

type Answer = ReturnType<typeof viewKeyFor>;

/** Dispatches a real KeyboardEvent from `target` and returns what `viewKeyFor` says about it. The answer is taken
 * while the event is in flight: `composedPath()` is empty once dispatch is over. `before` runs first, on the
 * document in the capture phase, like an earlier handler that took the key. */
function press(target: Element, init: KeyboardEventInit, before?: (e: Event) => void): { answer: Answer; seenTarget: EventTarget | null } {
  let answer: Answer = null, seenTarget: EventTarget | null = null;
  const catcher = (e: Event) => { answer = viewKeyFor(e as KeyboardEvent); seenTarget = e.target; };
  if (before) document.addEventListener("keydown", before, true);
  document.addEventListener("keydown", catcher);
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, cancelable: true, ...init }));
  document.removeEventListener("keydown", catcher);
  if (before) document.removeEventListener("keydown", before, true);
  return { answer, seenTarget };
}
const el = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  const e = d.firstElementChild!;
  document.body.appendChild(e);
  return e;
};

describe("viewKeyOf", () => {
  it("maps the arrows to pan, plus and minus to zoom, the brackets to rotate, and Space to reset", () => {
    const k = (key: string) => viewKeyOf({ key, ctrlKey: false, metaKey: false });
    expect([k("ArrowUp"), k("ArrowDown"), k("ArrowLeft"), k("ArrowRight"), k(" ")]).toEqual(["panUp", "panDown", "panLeft", "panRight", "reset"]);
    expect([k("+"), k("="), k("-"), k("_")]).toEqual(["zoomIn", "zoomIn", "zoomOut", "zoomOut"]);
    expect([k("["), k("]")]).toEqual(["rotateLeft", "rotateRight"]);
    expect(k("a")).toBeNull();
    expect(k("Enter")).toBeNull();
  });
  it("leaves Ctrl and Cmd chords to the browser", () => {
    expect(viewKeyOf({ key: "ArrowLeft", ctrlKey: true, metaKey: false })).toBeNull();
    expect(viewKeyOf({ key: "ArrowLeft", ctrlKey: false, metaKey: true })).toBeNull();
    expect(viewKeyOf({ key: " ", ctrlKey: true, metaKey: false })).toBeNull();
  });
});

describe("isSaveChord", () => {
  const s = (init: Partial<KeyboardEvent>) => isSaveChord({ key: "s", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init });
  it("is Cmd-S or Ctrl-S, either case, and nothing else", () => {
    expect(s({ metaKey: true })).toBe(true);
    expect(s({ ctrlKey: true })).toBe(true);
    expect(s({ ctrlKey: true, key: "S" })).toBe(true);
    expect(s({})).toBe(false);
    expect(s({ ctrlKey: true, shiftKey: true })).toBe(false); // Save As belongs to the browser
    expect(s({ ctrlKey: true, altKey: true })).toBe(false);
    expect(s({ ctrlKey: true, key: "a" })).toBe(false);
  });
});

describe("who keeps the keys", () => {
  it("text boxes, selects, textareas, range sliders and contenteditable keep every key", () => {
    for (const h of ['<input type="text">', '<input type="number">', '<input type="range">', "<input>", "<select></select>", "<textarea></textarea>", '<div contenteditable="true"></div>']) {
      const e = el(h);
      expect(takesTyping(e), h).toBe(true);
      expect(press(e, { key: "ArrowUp" }).answer, h).toBeNull();
    }
  });
  it("a checkbox, a button or a plain box does not need the arrows", () => {
    for (const h of ['<input type="checkbox">', "<button></button>", "<div></div>"]) {
      const e = el(h);
      expect(takesTyping(e), h).toBe(false);
      expect(press(e, { key: "ArrowUp" }).answer, h).toBe("panUp");
    }
  });
  it("Space stays with whatever it activates, so a focused button still clicks", () => {
    for (const h of ["<button></button>", "<summary></summary>", '<a href="#x">x</a>', '<div role="button"></div>', '<input type="checkbox">']) {
      const e = el(h);
      expect(takesSpace(e), h).toBe(true);
      expect(press(e, { key: " " }).answer, h).toBeNull();
    }
    expect(press(el("<div></div>"), { key: " " }).answer).toBe("reset");
  });
  it("a key already handled, or typed during IME composition, is not a view key", () => {
    expect(press(el("<div></div>"), { key: "ArrowUp" }, (e) => e.preventDefault()).answer).toBeNull();
    expect(press(el("<div></div>"), { key: "ArrowUp", isComposing: true }).answer).toBeNull();
  });
  it("the real target counts when the event comes out of a shadow root", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<input type="text">';
    document.body.appendChild(host);
    const r = press(root.querySelector("input")!, { key: "ArrowLeft" });
    expect(r.seenTarget).toBe(host); // retargeted: only composedPath sees the input
    expect(r.answer).toBeNull();
  });
});

describe("planKeyFor (S31.4)", () => {
  type K = { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
  /** The answer for a real event started on `target`, taken while it is in flight. */
  const plan = (init: K, deviceFocused: boolean, target: Element = el("<div></div>")): ReturnType<typeof planKeyFor> => {
    let answer: ReturnType<typeof planKeyFor> = null;
    const catcher = (e: Event) => { answer = planKeyFor(e as KeyboardEvent, deviceFocused); };
    document.addEventListener("keydown", catcher);
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, cancelable: true, ...init }));
    document.removeEventListener("keydown", catcher);
    return answer;
  };
  const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
  const FOCUS = { ArrowLeft: "focusLeft", ArrowRight: "focusRight", ArrowUp: "focusUp", ArrowDown: "focusDown" } as const;
  const PAN = { ArrowLeft: "panLeft", ArrowRight: "panRight", ArrowUp: "panUp", ArrowDown: "panDown" } as const;

  it("every key x device focused x Shift x text field", () => {
    const keys = [...ARROWS, "Enter", " ", "Escape", "+", "=", "-", "_", "[", "]", "a", "Tab"];
    for (const key of keys) for (const dev of [false, true]) for (const shiftKey of [false, true]) for (const typing of [false, true]) {
      const target = typing ? el('<input type="text">') : el("<div></div>");
      const got = plan({ key, shiftKey }, dev, target);
      const label = `${JSON.stringify(key)} dev=${dev} shift=${shiftKey} typing=${typing}`;
      let want: ReturnType<typeof planKeyFor>;
      if (typing) want = null;
      else if ((ARROWS as readonly string[]).includes(key)) want = shiftKey || !dev ? PAN[key as keyof typeof PAN] : FOCUS[key as keyof typeof FOCUS];
      else if (key === "Enter") want = dev ? "open" : null;
      else if (key === " ") want = dev ? "open" : "reset";
      else if (key === "Escape") want = dev ? "leave" : null;
      else if (key === "+" || key === "=") want = "zoomIn";
      else if (key === "-" || key === "_") want = "zoomOut";
      else if (key === "[") want = "rotateLeft";
      else if (key === "]") want = "rotateRight";
      else want = null;
      expect(got, label).toBe(want);
    }
  });
  it("Ctrl and Cmd chords are never plan keys", () => {
    for (const key of [...ARROWS, "Enter", " ", "Escape"]) for (const dev of [false, true]) {
      expect(plan({ key, ctrlKey: true }, dev), key).toBeNull();
      expect(plan({ key, metaKey: true }, dev), key).toBeNull();
    }
  });
  it("Enter and Space stay with a focused button, a link or a checkbox", () => {
    for (const h of ["<button></button>", '<a href="#x">x</a>', '<div role="button"></div>', '<input type="checkbox">']) {
      expect(plan({ key: "Enter" }, true, el(h)), h).toBeNull();
      expect(plan({ key: " " }, true, el(h)), h).toBeNull();
    }
  });
  it("Escape and the arrows with a device focused still reach the plan from a button", () => {
    expect(plan({ key: "Escape" }, true, el("<button></button>"))).toBe("leave");
    expect(plan({ key: "ArrowRight" }, true, el("<button></button>"))).toBe("focusRight");
  });
  it("a handled key or IME composition is not a plan key", () => {
    const t = el("<div></div>");
    let a: ReturnType<typeof planKeyFor> = "x" as never;
    const h = (e: Event) => { e.preventDefault(); };
    const c = (e: Event) => { a = planKeyFor(e as KeyboardEvent, true); };
    document.addEventListener("keydown", h, true); document.addEventListener("keydown", c);
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true, cancelable: true }));
    document.removeEventListener("keydown", h, true); document.removeEventListener("keydown", c);
    expect(a).toBeNull();
    expect(plan({ key: "ArrowRight", isComposing: true } as never, true)).toBeNull();
  });
  it("viewKeyOf and viewKeyFor are unchanged: arrows pan, Space resets, Enter and Escape are nothing", () => {
    const k = (key: string) => viewKeyOf({ key, ctrlKey: false, metaKey: false });
    expect([k("ArrowLeft"), k(" "), k("Enter"), k("Escape")]).toEqual(["panLeft", "reset", null, null]);
  });
});
