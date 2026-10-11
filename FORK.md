# Fork log

What this fork changed compared with upstream
[`vespassassina/ha-floorplan-studio`](https://github.com/vespassassina/ha-floorplan-studio).
Newest first. Add an entry with every change that upstream does not have.

**Forked from:** upstream `main` at `27fb096` (release 0.20.0, 2026-10-07).
**Last synced:** upstream `main` at `d1ec086` (release 0.26.2, 2026-10-11).

To see the full difference at any time:

```bash
git remote add upstream https://github.com/vespassassina/ha-floorplan-studio.git  # once
git fetch upstream
git log --oneline upstream/main..HEAD   # our commits
git diff upstream/main --stat           # files we changed
```

## 2026-10-11: Card UI refactor — system (branch `task/ui-system`)

- Outdoor kinds (garden, terrace, pavement, water) are drawn quiet: `--fp-<kind>-fill` mixes the kind colour into the
  background, closer to it than an unpainted room in every theme. The plan, the room-name surface (`--fp-under`) and the 3D
  ground read the fill tokens; trees keep the raw kind colour. Solarized's outdoor hexes were darkened to fit.

## 2026-10-11: Card UI refactor — integration fixes (branch `task/ui-refactor`)

- 3D: a change of the view's aspect keeps the camera's zoom against the new framing (`Orbit.setAspect`). The card's height
  follows each floor, and the projected fit depends on the aspect, so a floor switch restored a stored camera 6 % off.
- 3D: a room tap is committed after the double-tap window. With the Overview folded, the first tap's pick opened the room
  panel over the point tapped and a double tap could not undo it.
- The folded Overview hides its breadcrumb below 480 px, so the summary chips (alerts first) keep the one line.
- Tests that pinned the old design (motion red, HA dark walls in the text colour, controls outside View options, a
  two-value 3D inset, the long time format) now pin the new one.

## 2026-10-11: Card UI refactor — plan (branch `task/ui-plan`)

Spec: `docs/specs/card-ui-refactor.md`, items 5 to 8.

- The stack fan's ring grows with the drawn disc and name tags, so members never overlap at any zoom
  (`spiderLayout` takes a `SpiderSize`; the card passes it).
- Far-zoom dots carry their glyph (half size, 3:1 ink on the dot); the dot grows from .5 to .64.
- Red is for alerts only: motion has its own non-red colour in every theme (`ThemeRoles.motion`), and a motion sensor that lights its
  room's outline draws no ring of its own.
- `ha` theme in dark mode draws walls in a mid grey mixed from HA's text and card colours instead of the text colour itself.
## 2026-10-11: Card UI refactor — 3D (branch `task/ui-3d`)

- The 3D ground fades to transparent toward its border, so it has no visible edge on any page (`view3d.ts` `buildGround`).
- 3D labels (room names, readouts, device values and names) are chips on the 2D label tag colour. The declutter never keeps a
  room's readout when it drops that room's name.
- Idle devices in 3D are full markers: lit size, opaque `--fp-disc` disc, thin `--fp-idle` edge, full-opacity glyph at 3:1 or
  better (`overlay.ts`, `inkFor`). Never hidden.
- The first 3D view frames the house box in the free area: 85 % of the view under the toolbar and beside the Active list,
  centred, on every floor; Reset camera returns to it (`orbit.ts`, new `top` inset and `shiftY`; the card passes the
  toolbar's bottom edge).
## 2026-10-11: Card UI refactor — shell (branch `task/ui-shell`)

- The Overview starts folded at every width (one line: breadcrumb and chips); a tap on the line opens it; the pick is remembered per viewer.
- The device popup sits beside the device it opened from (never over its icon); under 480 px it is the full-width sheet on the half away from the device.
- One toolbar: a View segmented control and a View options menu holding every other look control, at every width; tilt has a label. Reset view is hidden until the view differs.
- Default `detail` is `full` (was `auto`); a floor pill of another floor only switches; no unit after a non-numeric state; Motion times are short.

## 2026-10-11: Sync with upstream 0.26.2 (branch `task/upstream-sync-0.26.2`)

Merged upstream `d1ec086` (0.23.0 to 0.26.2). The plain merge left 50 files in
conflict, nearly all only because this fork had run oxfmt over the repo. Each was
merged again with the base and upstream sides oxfmt-formatted first, which left 6
real conflicts plus `docs/DECISIONS.md`:

- The Lock plan toggle: upstream's 0.24 pill (a mask lock, "Plan locked" or
  "Plan editable") replaces this fork's SVG lock on "Fix plan" (2026-10-09 entry
  below). Upstream's toolbar now lives in `src/editor/toolbar.ts`.
- `src/core/scene-build.ts`: furniture parts (this fork) and the tree trunk and
  crown (upstream S28.7) are combined. A tree has no parts, so it takes upstream's path.
- `src/card/three/shade.ts` (new upstream, 3D contact shadows): a piece built
  from parts casts one patch under its whole footprint, not one per part (a
  table cast four leg spots). `foldParts` merges a piece's parts into one box in
  its own frame before shading; 5000 tables shade in about 25 ms.
- `scripts/shots.mjs`: both the furniture-parts shots and upstream's
  floors-below and `--polish` shots are kept.
- `tests/fixtures/ghost-contrast.ts` (new upstream) uses an indirect `eval` inside
  `page.evaluate`; this fork's oxlint flags it, so that one line has an
  `oxlint-disable-next-line no-eval`.
- `tests/card/plan-patch.test.ts`: the every-device-type test takes about 4 s
  here (as on pristine upstream) and timed out at vitest's 5 s default under
  the full parallel suite; it has a 20 s budget.

## 2026-10-09: Clearer toggles, confirm and 3D markers (branch `task/ui-review-2`)

- A toolbar toggle that is on wears a primary ring; one that is off is a plain button (it was dimmed and read as disabled).
- The popup's second press of a turn off reads "Yes, turn off" in the danger colour, on one line.
- In 3D an off device's ball takes the disc colour, so its grey glyph no longer vanishes into a grey ball.
- Editor: the Fix plan switch draws an SVG lock (CSS mask) instead of an emoji (superseded by upstream's Lock plan pill in the 0.26.2 sync); the floor panel's two help lines are one.

## 2026-10-09: Phone-width card and clearer panel text (branch `task/ui-review-1`)

- Below 480 px the card folds view, walls, theme, labels and names behind one View options button (Escape closes it), so they no longer cover the plan.
- The popup spans the card's width on a narrow card; its sliders keep at least one whole slider in view (the track vanished on a 250 px card); Details has a disclosure triangle.
- A light popup with a brightness slider says "on" above it, not the same "50 %" twice.
- Pill chips and floor-off buttons are 40 px tall under a coarse pointer.
- An entity with no name or `friendly_name` is listed as its id in words ("Demo living temp2"), not `sensor.demo_living_temp2`.
- The Overview header spells out the first four chips (alerts first), then "+N more"; an empty list drops its "Active · 0" heading.

## 2026-10-09: Furniture parts in 3D (branch `task/furniture-parts`)

- 3D view draws table, sofa, bed, chair, sink, toilet, bathtub and car as a few boxes each instead of one block (`src/core/furniture-parts.ts`, `src/core/scene-build.ts`). 2.5D unchanged.

## 2026-10-09: Sync with upstream 0.22.1 (branch `task/upstream-sync`)

Merged upstream `05a5e8a`. Every conflict was in a file this fork had only
reformatted, so upstream's side was taken and `task fix` re-ran oxfmt.
Two upstream build scripts needed APIs our toolchain no longer has:

- `scripts/minify-output.mjs` called Vite's `transformWithEsbuild`, which
  Vite 8 dropped. It now calls oxc's `minify` (re-exported by Vite) with
  compress and mangle off: whitespace and non-legal comments only, as before.
- `scripts/strip-css-comments.mjs` and `tests/card/size-budget.spec.ts` parse
  source with the TypeScript compiler API, which TypeScript 7 (native) does
  not ship. They import `typescript-api`, an npm alias for TypeScript 5.9.
  Both packages install a `tsc` bin, so `npm run typecheck` calls
  `node_modules/typescript/bin/tsc` (7.x) by path.

## 2026-10-08: Modern dev workflow (branch `task/dev-workflow`)

**Safety**
- Removed the "Release ends on Diego's HA" section from `CLAUDE.md`. It told
  AI agents to refresh HACS, install an update and restart the upstream
  maintainer's Home Assistant.

**Python (uv)**
- `pyproject.toml` + `uv.lock` replace `requirements_test.txt`. `uv sync`
  sets up everything; Python 3.14.
- Test harness pinned to `pytest-homeassistant-custom-component==0.13.367`
  (Home Assistant 2026.9.4, the newest stable; later builds track betas), and
  `home-assistant-frontend` to the version that HA release needs.
- ruff (lint + format) and ty (type check) added; Python code formatted.
  One type fix: `panel.py` passes `str(version)` to `_card_url`.

**Web**
- Vite 5 → 8, Vitest 2 → 5, TypeScript 5 → 7, jsdom 25 → 30,
  Playwright 1.64, Node 24 (`.nvmrc`). Lockfile regenerated. Bundles are
  smaller with Vite 8: card −17 %, panel −12 %, 3D chunk −24 %, editor −3 %.
- ESLint → oxlint (`.oxlintrc.json`, correctness rules). oxfmt formats
  TS/JS/JSON/YAML/HTML (`.oxfmtrc.json`, width 120); whole repo formatted once
  (in `.git-blame-ignore-revs`).
  Lit `html`` ` templates and `src/core/schema.ts` are not formatted
  (template whitespace changed rendered labels; schema.ts feeds `docs/schema.md`).
- Playwright runs `fullyParallel`: 15.6 → ~4 minutes, same 1237 tests passing.
- `scripts/validate-layout.mjs` uses Vite's `build()` instead of esbuild
  (esbuild only came in through Vite 5).
- Two test-only fixes for the new tools: a typed spy in
  `tests/core/debug-once.test.ts`, `1e999` → `Infinity` in
  `tests/card/card-3d-perf.spec.ts`.

**Workflow**
- `.pre-commit-config.yaml`, run by prek: gitleaks, basic file checks,
  actionlint, ruff, ty, oxlint, oxfmt, tsc. Install with `task hooks`.
  GitHub Actions use version tags, not SHA pins (kept simple on purpose).
- `Taskfile.yml`: `task setup`, `task check`, `task fix`, `task test:e2e`,
  `task build`, `task dev`, `task shots`.
- CI uses the same commands as the Taskfile, adds a job that runs every hook,
  uses uv for Python, and reads the Node version from `.nvmrc`.
- `.editorconfig`, `.gitattributes`; devcontainer on Python 3.14 + Node 24
  with uv.
- README, CONTRIBUTING, `docs/WORKFLOW.md` and `CLAUDE.md` command lists
  updated.
