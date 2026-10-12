import { afterEach, describe, expect, it } from "vitest";
import { createOverlay } from "../../src/card/three/overlay";

// S29 (H6): the overlay draws a room's temperature on a pill, as text (never markup), and recolours it on a heat change alone.
const room = (heat: number | null, temp = "16 °C", rest = "48 %") => ({
  name: "Living",
  at: [10, 20],
  readout: [temp, rest].filter(Boolean).join(" · "),
  temp,
  rest,
  heat,
  motion: null,
});
const liveWith = (r: ReturnType<typeof room>) =>
  ({
    night: false,
    labels: true,
    names: false,
    pulse: [3, 1],
    lights: [],
    doors: [],
    devices: [],
    pieces: [],
    rooms: [r],
  }) as never;
const anchors = { devices: new Map(), rooms: new Map([[0, [10, 0, 20] as const]]) };
afterEach(() => (document.body.innerHTML = ""));

describe("overlay: the temperature pill", () => {
  it("puts the temperature in span.val-pill with --fp-temp-t, the rest after it; the text equals the readout", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(0)), anchors as never);
    const val = box.querySelector(".fp3-rm .fp3-val")!,
      pill = val.querySelector("span.val-pill") as HTMLElement;
    expect(pill.textContent).toBe("16 °C");
    expect(pill.style.getPropertyValue("--fp-temp-t")).toBe("0");
    expect(val.textContent).toBe("16 °C · 48 %");
    o.set(liveWith(room(1)), anchors as never);
    expect((box.querySelector(".fp3-val span.val-pill") as HTMLElement).style.getPropertyValue("--fp-temp-t")).toBe(
      "1",
    );
    o.dispose();
  });
  it("no heat, or no temperature, is plain text as before", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(null)), anchors as never);
    expect(box.querySelector(".fp3-val span")).toBeNull();
    o.set(liveWith(room(0.5, "", "48 %")), anchors as never);
    expect(box.querySelector(".fp3-val span")).toBeNull();
    expect(box.querySelector(".fp3-val")!.textContent).toBe("48 %");
    o.dispose();
  });
  it("a payload in the text stays text", () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    const o = createOverlay(box);
    o.set(liveWith(room(0.5, '"><img src=x onerror=alert(1)>', "")), anchors as never);
    expect(box.querySelector("img")).toBeNull();
    o.dispose();
  });
});
