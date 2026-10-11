import { test, expect, type Page } from "@playwright/test";
import { demo, serve, ORIGIN, holder, cam, drawn } from "./helpers-3d";

// UI refactor items 10 and 11b. 10: the 3D labels (room names, readouts, a device's value and name) are chips on the tag colour the 2D
// plan gives its labels (`.lbl-tag`: --fp-outline), so they read over walls, floors and ground. 11b: the declutter never keeps a room's
// readout while it drops that room's name.
const HA_DARK =
  "--primary-text-color:#e1e1e1;--secondary-text-color:#9b9b9b;--card-background-color:#1c1c1c;--secondary-background-color:#282828";
const st = (state: string) => ({ state, attributes: {}, last_changed: new Date().toISOString() });
const withReadout = () => {
  const l = structuredClone(demo);
  Object.assign(l.floors.ground.rooms[0], { temps: ["sensor.demo_living_temperature"] }); // the living room's readout: 21.5
  return l;
};
const STATES = { "sensor.demo_living_temperature": st("21.5"), "sensor.demo_bedroom_temperature": st("19") };

async function boot(page: Page, layout: unknown, theme: string, vars = "", dark = false) {
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
    [{ layout, floor: "ground", view: "3d", theme, active_list: false, names: false }, vars, dark, STATES] as const,
  );
  await drawn(page);
}
async function settled(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const s = JSON.stringify([
          (await cam(page)).drawn,
          await holder(page).evaluate((el) =>
            [...el.querySelectorAll(".fp3-ov .fp3-lose")].map((e) => e.className + e.textContent),
          ),
        ]);
        const same = s === last;
        last = s;
        return same;
      },
      { timeout: 15000, intervals: [400] },
    )
    .toBe(true);
}

for (const [name, theme, vars, dark] of [
  ["light", "light", "", false],
  ["blueprint", "blueprint", "", false],
  ["ha-dark", "ha", HA_DARK, true],
] as const)
  test(`${name}: room names, readouts and device labels are chips on the 2D tag colour, and the pixels inside them are that colour`, async ({
    page,
  }) => {
    await boot(page, withReadout(), theme, vars, dark);
    await settled(page);
    const chips = await holder(page).evaluate((root) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--fp-outline)";
      root.appendChild(probe);
      const tag = getComputedStyle(probe).color;
      probe.remove();
      const out: {
        sel: string;
        bg: string;
        radius: number;
        padX: number;
        padY: number;
        x: number;
        y: number;
        h: number;
      }[] = [];
      for (const sel of [".fp3-name", ".fp3-val", ".fp3-dv", ".fp3-dn"])
        root.querySelectorAll<HTMLElement>(`.fp3-ov ${sel}`).forEach((e) => {
          const host = e.closest<HTMLElement>(".fp3-dev, .fp3-rm")!;
          if (host.style.visibility === "hidden" || e.hidden || e.classList.contains("fp3-lose")) return;
          const c = getComputedStyle(e),
            r = e.getBoundingClientRect();
          out.push({
            sel,
            bg: c.backgroundColor,
            radius: parseFloat(c.borderTopLeftRadius),
            padX: parseFloat(c.paddingLeft),
            padY: parseFloat(c.paddingTop),
            x: r.left,
            y: r.top,
            h: r.height,
          });
        });
      return { tag, out };
    });
    expect(
      chips.out.map((c) => c.sel),
      "a room name and a readout are on show",
    ).toEqual(expect.arrayContaining([".fp3-name", ".fp3-val"]));
    for (const c of chips.out) {
      expect(c.bg, `${c.sel} background`).toBe(chips.tag);
      expect(c.radius, `${c.sel} radius`).toBeGreaterThan(0);
      expect(c.padX, `${c.sel} padding`).toBeGreaterThan(0);
    }
    // Pixels: 1.5 px inside the chip's left edge, mid height, is the chip's own padding, so it is the tag colour whatever lies under it.
    const want = (
      /\d+/g.exec(chips.tag)
        ? chips.tag
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
        : [0, 0, 0]
    ) as number[];
    let ok = 0;
    for (const c of chips.out) {
      const buf = await page.screenshot({
        clip: { x: Math.round(c.x + 1.5), y: Math.round(c.y + c.h / 2), width: 1, height: 1 },
      });
      const px = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext("2d")!;
        g.drawImage(img, 0, 0);
        return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      }, buf.toString("base64"));
      if (Math.max(...px.map((v, k) => Math.abs(v - want[k]))) <= 6) ok++;
    }
    expect(ok, `chips whose padding pixel is ${want.join(",")}, of ${chips.out.length}`).toBe(chips.out.length);
  });

/** Where the living room's label sits on the screen, and where a device at plan (x, y) and its own height sits. */
const hook = <T>(page: Page, expr: string) => page.evaluate(`(${expr})(window.__fp3d)`) as Promise<T>;

test("11b: a marker over a room's name drops the readout too; the name is never gone while its readout stays", async ({
  page,
}) => {
  const withProbe = (x: number, y: number) => {
    const l = withReadout();
    l.floors.ground.devices.push({ id: "probe", type: "light", entity: "light.probe", name: "Probe", x, y });
    return l;
  };
  // First boot: find where the probe lands for (250, 200), and the living room's label, then solve for a spot 24 px above the label's centre.
  await boot(page, withProbe(250, 200), "light");
  await settled(page);
  const idx = demo.floors.ground.devices.length;
  const solve = await hook<{
    lab: { x: number; y: number };
    dev: { x: number; y: number };
    jx: number[];
    jy: number[];
  }>(
    page,
    `(h) => {
      const z = h.anchors().find((a) => a.index === ${idx}).z, p = (x, y) => h.project(x, y, z), d = p(250, 200), dx = p(260, 200), dy = p(250, 210);
      const el = document.getElementById("card").shadowRoot.querySelector('.fp3-rm[data-r="0"]'), r = el.getBoundingClientRect();
      return { lab: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, dev: d,
        jx: [(dx.x - d.x) / 10, (dx.y - d.y) / 10], jy: [(dy.x - d.x) / 10, (dy.y - d.y) / 10] };
    }`,
  );
  const want = { x: solve.lab.x, y: solve.lab.y - 24 },
    ex = want.x - solve.dev.x,
    ey = want.y - solve.dev.y,
    det = solve.jx[0] * solve.jy[1] - solve.jy[0] * solve.jx[1],
    dpx = (ex * solve.jy[1] - solve.jy[0] * ey) / det,
    dpy = (solve.jx[0] * ey - ex * solve.jx[1]) / det;
  const page2 = await page.context().newPage();
  await boot(page2, withProbe(250 + dpx, 200 + dpy), "light");
  await settled(page2);
  const s = await page2.evaluate((n) => {
    const root = document.getElementById("card")!.shadowRoot!;
    const rm = root.querySelector<HTMLElement>('.fp3-rm[data-r="0"]')!,
      name = rm.querySelector<HTMLElement>(".fp3-name")!,
      val = rm.querySelector<HTMLElement>(".fp3-val")!,
      ic = [...root.querySelectorAll<SVGElement>("svg.fp3-ic")].find((e) => e.getAttribute("data-i") === String(n))!;
    const box = (e: Element) => e.getBoundingClientRect();
    const meets = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      iconOverName: meets(box(ic), box(name)),
      iconOverVal: meets(box(ic), box(val)),
      nameLost: name.classList.contains("fp3-lose"),
      valLost: val.classList.contains("fp3-lose"),
      iconLost: ic.classList.contains("fp3-lose"),
    };
  }, idx);
  expect(s.iconOverName, "premise: the marker covers the name").toBe(true);
  expect(s.iconOverVal, "premise: the marker leaves the readout alone").toBe(false);
  expect(s.iconLost, "the marker (a control) stays").toBe(false);
  expect(s.nameLost, "the name gives way to the marker").toBe(true);
  expect(s.valLost, "so the readout goes with it").toBe(true);
});
