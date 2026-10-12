import { test, expect } from "@playwright/test";
import { FLOORPLAN_CSS, textEm } from "../../src/core/render";

// S29 (H4): the pill is sized from an estimate, not a measurement (core draws markup, it cannot measure). A flat 0.6 em per
// character, the room-name tag's rule, put the pill well left of "21.7 °C · 48 %" (digits, the narrow no-break space and the
// middle dot are much narrower), so the readout uses a per-character table. Checked here against Chromium's own text length
// in the plan's font stack: within 10 %.
const SAMPLES = ["21.7 °C", "21.7 °C · 48 %", "-3.5 °C", "70 °F · 100 %", "18 °C"];

test("textEm is within 10 % of the measured width of a readout", async ({ page }) => {
  await page.setContent(
    `<!DOCTYPE html><html><body><style>${FLOORPLAN_CSS}</style><svg width="900" height="600"><g data-theme="light">${SAMPLES.map((s, i) => `<text class="val" id="t${i}" x="10" y="${100 + i * 100}" font-size="100">${s}</text>`).join("")}</g></svg></body></html>`,
  );
  const real = await page.evaluate(
    (n) =>
      Array.from(
        { length: n },
        (_, i) => (document.getElementById(`t${i}`) as unknown as SVGTextElement).getComputedTextLength() / 100,
      ),
    SAMPLES.length,
  );
  SAMPLES.forEach((s, i) => {
    const est = textEm(s);
    expect(
      Math.abs(est - real[i]!) / real[i]!,
      `${JSON.stringify(s)}: estimate ${est.toFixed(2)} em, real ${real[i]!.toFixed(2)} em`,
    ).toBeLessThan(0.1);
  });
});
