import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, holder, drawn, card } from "./helpers-3d";

// UI refactor item 9: a device that is off is a control, so in 3D it reads and taps as well as one that is on: the same 32 px marker,
// an opaque disc in --fp-disc with a thin edge, the glyph at full opacity and at least 3:1 against the disc, in every theme.
const HA_LIGHT =
  "--primary-text-color:#212121;--secondary-text-color:#727272;--card-background-color:#ffffff;--secondary-background-color:#e5e5e5";
const HA_DARK =
  "--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--card-background-color:#1c1c1c;--secondary-background-color:#282828";
const THEMES = [
  ["light", "light", "", false],
  ["blueprint", "blueprint", "", false],
  ["ha-light", "ha", HA_LIGHT, false],
  ["ha-dark", "ha", HA_DARK, true],
] as const;
const st = (state: string, attributes = {}) => ({ state, attributes, last_changed: new Date().toISOString() });
// The demo's lights: kitchen on (the control), living off (the one under test); every other device keeps its default.
const STATES = { "light.demo_kitchen": st("on"), "light.demo_living": st("off") };

async function boot(page: Page, theme: string, vars: string, dark: boolean) {
  await serve(page);
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${ORIGIN}/harness.html`);
  await page.evaluate(() => customElements.whenDefined("floorplan-studio-card"));
  await page.evaluate(
    ([config, v, isDark, states]) => {
      document.body.setAttribute("style", v as string);
      const el = document.getElementById("card") as any;
      el.setConfig(config);
      el.hass = { states, themes: { darkMode: isDark }, callService: () => undefined };
      return el.updateComplete;
    },
    [
      { layout: structuredClone(demo), floor: "ground", view: "3d", theme, active_list: false },
      vars,
      dark,
      STATES,
    ] as const,
  );
  await drawn(page);
}

interface Mark {
  i: number;
  cls: string;
  cx: number;
  cy: number;
  size: number;
  haloFill: string;
  haloOpacity: number;
  haloStroke: string;
  haloStrokeWidth: number;
  glyphFill: string;
  glyphOpacity: number;
  disc: string;
}
/** Every icon on show and not faded out by the declutter, as the browser draws it. */
const marks = (page: Page) =>
  holder(page).evaluate((root) => {
    const out: Mark[] = [];
    const probe = document.createElement("span");
    root.appendChild(probe);
    probe.style.color = "var(--fp-disc)";
    const disc = getComputedStyle(probe).color;
    probe.remove();
    root.querySelectorAll<HTMLElement>(".fp3-dev").forEach((el) => {
      const svg = el.querySelector("svg.fp3-ic")!,
        g = svg.querySelector("g")!,
        halo = g.querySelector(".halo"),
        path = g.querySelector("path");
      if (!halo || !path || el.style.visibility === "hidden" || svg.classList.contains("fp3-lose")) return;
      const r = svg.getBoundingClientRect(),
        h = getComputedStyle(halo),
        p = getComputedStyle(path);
      out.push({
        i: +svg.getAttribute("data-i")!,
        cls: g.getAttribute("class") ?? "",
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        size: r.width,
        haloFill: h.fill,
        haloOpacity: parseFloat(h.fillOpacity),
        haloStroke: h.stroke,
        haloStrokeWidth: parseFloat(h.strokeWidth),
        glyphFill: p.fill,
        glyphOpacity: parseFloat(p.fillOpacity) * parseFloat(getComputedStyle(g).opacity),
        disc,
      });
    });
    return out;
  });
const rgb = (c: string) => {
  const m = /^(rgba?|color)\(\s*(?:srgb\s+)?([^)]*)\)$/.exec(c.trim());
  const v = (m?.[2] ?? "0 0 0")
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return v.slice(0, 3).map((x) => (m?.[1] === "color" ? Math.round(x * 255) : x));
};
const lum = (c: number[]) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const isOn = (m: Mark) => /\bon\b/.test(m.cls);
const isDanger = (m: Mark) => /\bdanger\b/.test(m.cls);

for (const [name, theme, vars, dark] of THEMES) {
  test.describe(`${name}`, () => {
    test("an idle device's marker is an opaque disc in --fp-disc with an edge, and its glyph is full ink at 3:1", async ({
      page,
    }) => {
      await boot(page, theme, vars, dark);
      const all = await marks(page),
        idle = all.filter((m) => !isOn(m) && !isDanger(m));
      expect(idle.length, "idle markers on show").toBeGreaterThan(5);
      for (const m of idle) {
        const at = `device ${m.i} (${m.cls})`;
        expect(m.haloOpacity, `${at}: disc opacity`).toBe(1);
        expect(rgb(m.haloFill), `${at}: disc colour`).toEqual(rgb(m.disc));
        expect(m.haloStroke, `${at}: an edge`).not.toBe("none");
        expect(m.haloStrokeWidth, `${at}: a thin edge`).toBeGreaterThan(0);
        expect(m.haloStrokeWidth, `${at}: a thin edge`).toBeLessThanOrEqual(2);
        expect(m.glyphOpacity, `${at}: glyph opacity`).toBeGreaterThanOrEqual(0.99);
        expect(contrast(rgb(m.glyphFill), rgb(m.disc)), `${at}: glyph against disc`).toBeGreaterThanOrEqual(3);
        expect(contrast(rgb(m.haloStroke), rgb(m.disc)), `${at}: edge against disc`).toBeGreaterThanOrEqual(3);
      }
    });

    test("an idle marker is the size of a lit one, and a real click inside its disc but far from its centre taps it", async ({
      page,
    }) => {
      await boot(page, theme, vars, dark);
      const all = await marks(page),
        on = all.find((m) => isOn(m))!,
        idle = all.filter((m) => !isOn(m) && !isDanger(m));
      expect(on, "a lit marker").toBeTruthy();
      for (const m of idle) expect(m.size, `device ${m.i}`).toBe(on.size);
      // The tap goes through the view's own `pick`: a click 14 px off the centre (inside the 16 px disc) picks the idle device.
      const probe = idle[0];
      const picked = await page.evaluate(([x, y]) => (window as any).__fp3d.pick(x, y), [
        probe.cx + 14,
        probe.cy,
      ] as const);
      expect(picked?.type, "a device").toBe("device");
      expect(picked?.index).toBe(probe.i);
      // And a real mouse click there reaches the device: the card opens its popup, as for a lit lamp (finding 3).
      const lamp = idle.find((q) => q.cls.includes("dev-light"))!;
      await page.mouse.click(lamp.cx + 14, lamp.cy);
      await expect(card(page).locator("css=.fp-pop")).toBeVisible();
    });

    test("the pixels at the rim of an idle disc are the disc colour, opaque, whatever lies under it", async ({
      page,
    }) => {
      await boot(page, theme, vars, dark);
      const m = (await marks(page)).filter((q) => !isOn(q) && !isDanger(q));
      const want = rgb(m[0].disc);
      let seen = 0;
      for (const q of m) {
        // 13 px to the left of the centre: inside the 16 px disc, outside the 24 px glyph box.
        const buf = await page.screenshot({
          clip: { x: Math.round(q.cx - 13) - 1, y: Math.round(q.cy) - 1, width: 2, height: 2 },
        });
        const px = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        }, buf.toString("base64"));
        // Another icon may lie over this one's rim: only a pixel that is near the disc's colour counts as read, and at least 4 must.
        const d = Math.max(...px.map((v, k) => Math.abs(v - want[k])));
        if (d <= 6) seen++;
      }
      expect(seen, `idle discs whose rim pixel is ${want.join(",")}`).toBeGreaterThanOrEqual(Math.min(4, m.length));
    });
  });
}
