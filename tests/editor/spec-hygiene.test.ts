import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Undo and Redo sit in the toolbar, not in File. An open menu's box hangs below its button and covers whatever
// wraps under it. On the CI runner's wider system font the toolbar wraps at 1280 px and Undo lands under File, so
// 66 tests that opened File "to reach" Undo timed out with "subtree intercepts pointer events" (the fix: do not
// open a menu you do not use). Two more did the same on 2026-10-11 (panel-inputs: File opened by a raw locator,
// view-labels: View reopened and left open across a drag). This reads the specs, since no local font reproduces
// the wrap by default.
const dir = "tests/editor";
const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));

const MENUS = "File|Edit|View|Add|Floors|Options";
const MENU_ID: Record<string, string> = { mFile: "File", mEdit: "Edit", mOpt: "View", mAdd: "Add", mFloors: "Floors" };
/** The menu a line opens (or toggles shut), by any of the ways the specs click a summary. */
function opened(l: string): { name: string; toggle: boolean }[] {
  const out: { name: string; toggle: boolean }[] = [];
  for (const m of l.matchAll(new RegExp(`\\bmenu\\(page, "(${MENUS})"\\)`, "g")))
    out.push({ name: m[1], toggle: true });
  for (const m of l.matchAll(new RegExp(`summary:text-is\\(\\\\?"(${MENUS})\\\\?"\\)\\)?\`?\\)?\\.click\\(`, "g")))
    out.push({ name: m[1], toggle: true });
  for (const m of l.matchAll(/#(mFile|mEdit|mOpt|mAdd|mFloors)\s*>\s*summary/g))
    if (/\.click\(/.test(l)) out.push({ name: MENU_ID[m[1]], toggle: true });
  if (/\bopenLabels\(page\)/.test(l)) out.push({ name: "View", toggle: false }); // opens View only if it is shut
  return out;
}
const UNDO = /(#(undo|redo)"\)|undoBtn\(page\))\.click\(|undoOnce\(/;
/** Anything that presses something else: a click, a key, the pointer. A press outside a menu closes it, and so does an item in it. */
const ACTION =
  /\.click\(|\.press\(|\.dblclick\(|mouse\.|dragOn\(|clickAt\(|closeMenus|Escape|pickFurniture|pickUnlinked|shiftDrag\(/;

/** Lines where Undo or Redo is clicked while a menu opened earlier in the same test is still open. */
export function undoUnderOpenMenu(src: string): string[] {
  const bad: string[] = [];
  let open = new Map<string, string>(); // menu -> the line that opened it
  src.split("\n").forEach((l, i) => {
    if (/^test(\.\w+)?\(/.test(l)) open = new Map();
    if (/^\s*\/\//.test(l)) return;
    if (/close it/.test(l)) {
      open.clear();
      return;
    } // a menu opened to close another one is the one exception
    const ops = opened(l);
    // Undo on the same line as the open that precedes it is the old one-line form: the open comes first.
    if (UNDO.test(l)) {
      const here = ops.length ? l.slice(l.search(/\bmenu\(page|summary|openLabels/)) : "";
      if (open.size || (ops.length && UNDO.test(here)))
        bad.push(`${i + 1}: ${[...open.values(), ...(ops.length ? [l.trim()] : [])][0].slice(0, 100)}`);
      open.clear();
      return;
    }
    if (ops.length) {
      for (const o of ops) {
        if (o.toggle && open.has(o.name)) open.delete(o.name);
        else if (!open.has(o.name)) open.set(o.name, l.trim());
      }
      return;
    }
    if (ACTION.test(l)) open.clear();
  });
  return bad;
}

describe("e2e specs", () => {
  it("never click Undo or Redo with a menu still open from earlier in the test", () => {
    const bad: string[] = [];
    for (const f of specs)
      for (const b of undoUnderOpenMenu(readFileSync(`${dir}/${f}`, "utf8"))) bad.push(`${f}:${b}`);
    expect(
      bad,
      "open a menu only to use it; Undo is not in any menu, and an open menu covers it on a wrapped toolbar",
    ).toEqual([]);
  });

  describe("the check itself", () => {
    const t = (body: string) => `test("x", async ({ page }) => {\n${body}\n});`;
    it("finds a menu opened by the helper on the line before Undo (the first form)", () => {
      expect(undoUnderOpenMenu(t(`  await menu(page, "File");\n  await page.locator("#undo").click();`))).toHaveLength(
        1,
      );
    });
    it("finds a menu opened by a raw summary locator (panel-inputs, 2026-10-11)", () => {
      expect(
        undoUnderOpenMenu(
          t(
            '  await page.locator(`details.menu > summary:text-is("File")`).click();\n  await page.locator("#undo").click();',
          ),
        ),
      ).toHaveLength(1);
    });
    it("finds a menu left open across lines that press nothing (view-labels, 2026-10-11)", () => {
      expect(
        undoUnderOpenMenu(
          t(
            `  await openLabels(page);\n  expect(await n(page)).toBe(1);\n  await expect(page.locator("#undo")).toBeEnabled();\n  await page.locator("#undo").click();`,
          ),
        ),
      ).toHaveLength(1);
    });
    it("finds the one-line form, and Redo, and undoBtn", () => {
      expect(undoUnderOpenMenu(t(`  await menu(page, "Edit"); await page.locator("#redo").click();`))).toHaveLength(1);
      expect(undoUnderOpenMenu(t(`  await menu(page, "Edit");\n  await undoBtn(page).click();`))).toHaveLength(1);
    });
    it("lets a menu that was toggled shut, or closed by a press, pass", () => {
      expect(
        undoUnderOpenMenu(
          t(`  await menu(page, "View");\n  await menu(page, "View");\n  await page.locator("#undo").click();`),
        ),
      ).toEqual([]);
      expect(
        undoUnderOpenMenu(
          t(
            `  await menu(page, "View");\n  await page.locator("#snap").click();\n  await page.locator("#undo").click();`,
          ),
        ),
      ).toEqual([]);
      expect(
        undoUnderOpenMenu(
          t(
            `  await menu(page, "View");\n  await page.keyboard.press("Escape");\n  await page.locator("#undo").click();`,
          ),
        ),
      ).toEqual([]);
    });
    it("does not carry an open menu from one test into the next", () => {
      expect(
        undoUnderOpenMenu(`${t(`  await menu(page, "File");`)}\n${t(`  await page.locator("#undo").click();`)}`),
      ).toEqual([]);
    });
  });
});
