# Fork log

What this fork changed compared with upstream
[`vespassassina/ha-floorplan-studio`](https://github.com/vespassassina/ha-floorplan-studio).
Newest first. Add an entry with every change that upstream does not have.

**Forked from:** upstream `main` at `27fb096` (release 0.20.0, 2026-10-07).
**Last synced:** upstream `main` at `3b4bc25` (release 0.31.0, 2026-10-15).

To see the full difference at any time:

```bash
git remote add upstream https://github.com/vespassassina/ha-floorplan-studio.git  # once
git fetch upstream
git log --oneline upstream/main..HEAD   # our commits
git diff upstream/main --stat           # files we changed
```

## 2026-10-16: Upstream 0.29.0 to 0.30.1 declined (merge `605b911`)

Upstream's Sprint 31 (card layout and touch: header bar, side and bottom sheets, the ⋯ `fp-menu` in `more-menu.ts`,
`frame.ts`, `plan-focus.ts`, 44 px targets) and Sprint 32 (3D framing: `fitBox`, `setFrame`, the glide) are not taken. This
fork's own card UI refactor covers the same ground with a different shell: one toolbar (View segmented control and a View
options popover), a folded Overview, the popup beside the device. Taking them would have meant two competing shells in
`floorplan-studio-card.ts`. The commit is `git merge -s ours` of upstream `977623e` (0.30.1), so git treats everything up to
there as merged and later syncs no longer offer those files or hunks. The fork's `docs/PLAN.md` and `docs/DECISIONS.md` carry
upstream's Sprint 31 and 32 only as the roadmap rows (labelled "Upstream").

## 2026-10-16: Sync with upstream 0.31.0 (branch `task/upstream-sync-0.31`)

Merged upstream `3b4bc25` (Sprint 33, release 0.31.0): the `fan` device type and its speed slider, `tap_action` and
`hold_action`, saved views (schema, Studio menu, card), the `ll-strategy-dashboard-floorplan-studio` dashboard strategy and the
S33 Opus review fixes. The plain merge left 39 files in conflict; the code files were merged again with base (`977623e`) and
upstream oxfmt-formatted first, which left real conflicts only in four places:

- `src/card/floorplan-studio-card.ts`: S33's saved views sat inside upstream's ⋯ menu (S31 code the fork lacks). Ported: the
  Views section is a labelled **Views row in View options** (`_savedViewsRow`, `.fp-vm-views`, one `button[data-view]` per
  view, `aria-pressed` for the applied one), shown only when the layout has views on floors this card shows; none under
  `kiosk` or `view_switch: false`, which draw no View options. `_savedViews` and `_applySavedView` run on the fork's own view
  state (`_selectFloor`, `_pickedView`, `_startTurn`, `_pendingView`, `_forgetCamera`); upstream's `setFrame`/glide do not exist
  here. `tap_action`/`hold_action` (`_tapOpts`, `_tapToggle`, `TOGGLE_AT_ONCE`) landed unchanged in the 2D and 3D device
  bindings (kiosk never holds: `longPress: false` was already the fork's). The S31-only `PX_STEP`/`qpx`/`qstrip` block and the
  header bar were not taken.
- `src/core/render.ts`: the fork's own motion colours (light `#b5389a`, Midnight `#e86ad0`, Solarized `#6c71c4`) and temperature
  tokens kept; `--fp-dev-fan` added to the Light, Midnight and Solarized sets (`#1f9ec4`, `#4cc3e8`, `#2aa198`, upstream's values)
  beside `DEVICE_COLOURS.fan` and the `.dev-fan.on` rule.
- `tests/card/config-editor.spec.ts`: both new tests kept (S29's and the Tap/Hold selects).
- `tests/card/view-parity.spec.ts`: `viewsSub` points at the Views row (`has: .fp-view-menu button[data-view=...]`), the card is
  mounted with a layout that has a view.

Docs: `CHANGELOG.md` (upstream's 0.31.0 under "Merged from upstream"), `docs/DECISIONS.md` (upstream entries tagged `[upstream]`),
`docs/PLAN.md` ("Upstream Sprint 33", S34 outline), `docs/card.md`, `README.md`, `docs/SPEC.md` worded for View options.
`manifest.json` stays 0.27.2. Upstream specs written against S31 UI were rewritten for the fork, not dropped:
`card-saved-views.spec.ts` (View options row, plus a computed-style pair), `card-fan.spec.ts` and `card-tap-action.spec.ts` (the
fork's "Yes, turn off" confirm, the Overview opened by hand), `tests/editor/saved-views.spec.ts` (the open View menu covers
Undo, so it is closed first); `tests/card/card-3d-tap-action.spec.ts` is new (upstream tested tap and hold in 2D only).

## 2026-10-16: Sync with upstream 0.28.1 (branch `task/upstream-sync-0.31`)

Merged upstream `7b28a75` (0.27.0 to 0.28.1: hand align with floor rotation, Align searches the turn, stairs,
menu-close fixes, Studio door guide). Upstream's Sprint 31 card layout and Sprint 32 3D framing are not taken (this fork
has its own card UI refactor). The plain merge left 24 files in conflict; the code files were merged again with base and
upstream oxfmt-formatted first, which left no real conflict in `src/`. What was resolved by hand:

- `CHANGELOG.md`, `docs/DECISIONS.md`, `docs/PLAN.md`: both sides kept. Upstream's entries sit under their own heading and
  carry "upstream" in the title (its 0.27.0 to 0.28.1, Sprint 29 and 30 collide with this fork's 0.27.x and Sprint 29).
- `custom_components/floorplan_studio/manifest.json`: version stays the fork's 0.27.2 (the release step picks the number).
- `scripts/shots.mjs`: upstream's `s.house` layout override and the fork's `s.furn` furniture layout are both kept.
- `tests/card/card-3d-below.spec.ts`: imports of both sides (`openViewMenu`, the hand-align truth fixtures).

## 2026-10-12: 3D frames and TVs no longer flicker while turning (branch `task/zfight`)

- Window/door frames share planes with their wall (jamb = wall end face, head = wall underside, tops at the cut), so the depth
  tie flipped with every small turn. Frames get a mesh of their own and, with furniture, pieces and device bodies, a polygon
  offset (`PROUD` -1); a TV screen / speaker driver `SCREEN` -2. `__fp3d.offsets()` test hook, `card-3d-zfight.spec.ts`.

## 2026-10-12: temperature pill border and alignment (branch `task/pill-polish`)

- `.val-pill` gets a 1 px stroke and the 3D pill an inset 1 px ring; a pill's readout line is drawn from a computed left edge
  (`text-anchor="start"`) with the pill 3 units before it; digits in `textEm` lean to Roboto (0.58 em).

## 2026-10-12: Sprint 29, switches (branch `task/s29`)

- `StoredView.art`/`heat`, `_pickedArt`/`_pickedHeat`, two View options rows, four keys in the view-memory seed, four config
  editor fields, `docs/card.md`.

## 2026-10-12: Sprint 29, cover art in the card (branch `task/s29`)

- One capturing `error` listener on the card's shadow root keeps a bounded set of failed art hrefs (`ART_FAILED_MAX` 64),
  passed to both views as `artFailed`; the shots serve a fake cover.

## 2026-10-12: Sprint 29, temperature pill in 3D (branch `task/s29`)

- `LiveRoom` carries `temp`, `rest`, `heat`; the overlay draws `span.val-pill` and its own idle ring rule.

## 2026-10-12: Sprint 29, temperature pill in 2D (branch `task/s29`)

- `renderFloor` draws `rect.val-pill` and `tspan.val-t` for a room's temperature, sized by `textEm` (a per-character width
  table); `.val-pill`, `.val .val-t` and `.halo.heat` rules.

## 2026-10-12: Sprint 29, Layers in 3D (branch `task/s29`)

- `liveOf` applies `layerHides`; `view3d.ts` hides balls, bodies, pools and glow for null slots and skips them in
  `Picker.pick`; the card shows the chips in 3D.

## 2026-10-12: Sprint 29, cover art markup (branch `task/s29`)

- `artUrl` in `src/core/schema.ts`; `deviceMarkup` draws `image.art` with a per-device clip; `.art` rules in `FLOORPLAN_CSS`;
  card key `media_art`.

## 2026-10-12: Sprint 29, temperature scale (branch `task/s29`)

- `meanValue`, `heatT`, `heatBounds`, `celsiusOf` in `src/core/readings.ts`; `roomReadoutParts`, `deviceHeat`, the `--fp-temp-*`
  tokens and their mixing rule in `src/core/render.ts` and `theme-roles.ts`; card keys `temp_colors`, `heat_min`, `heat_max`.

## 2026-10-12: Phone room sheet — accordion, no duplicate list (branch `task/sheet-fold`)

- On a card narrower than 480 px the room panel's device groups are an accordion (opening one folds the others and scrolls it to
  the top of the sheet) and the "Active here" list is not drawn there (its devices are under Devices). Wide cards unchanged.

## 2026-10-11: Card UI refactor — system (branch `task/ui-system`)

- One type scale (12 / 14 / 16 px), spacing scale (`--fp-space-1..5`: 4 / 8 / 12 / 16 / 24 px), radii (`--fp-radius-control` 6 px,
  `--fp-radius-surface` 12 px, pill) and two shadow tokens (`--fp-shadow-sm`, `--fp-shadow-lg`, mixed from `--fp-ink`) on the card
  host, replacing the off-scale sizes, radii and every `rgba(0, 0, 0, …)` in the card's CSS. Plan room names are 14 px semibold
  (outdoor and zone names 12), readouts and room badges 12; the 3D chips follow.
- Room panel: section headings (Devices, Active …) outrank group headings (Lights …); a fact's label is 12 px `--fp-text`,
  its value 14 px `--fp-ink`.
- Popup: More info is left-aligned with Details; the hue slider's thumb is round.
- Outdoor kinds (garden, terrace, pavement, water) are drawn quiet: `--fp-<kind>-fill` mixes the kind colour into the
  background, closer to it than an unpainted room in every theme. The plan, the room-name surface (`--fp-under`) and the 3D
  ground read the fill tokens; trees keep the raw kind colour. Solarized's outdoor hexes were darkened to fit.

## 2026-10-11: Card UI refactor — integration fixes (branch `task/ui-refactor`)

- 3D: a change of the view's aspect keeps the camera's zoom against the new framing (`Orbit.setAspect`). The card's height
  follows each floor, and the projected fit depends on the aspect, so a floor switch restored a stored camera 6 % off.
- 3D: a room tap is committed after the double-tap window. With the Overview folded, the first tap's pick opened the room
  panel over the point tapped and a double tap could not undo it.
- The folded Overview hides its breadcrumb below 480 px, so the summary chips (alerts first) keep the one line.
- A lit water room glows from its full water colour, so a pond stays blue under `room_glow` now that its unlit fill is
  quiet. The folded Overview header is 4 px padded top and bottom, so it stays one 32 px line with 14 px text.
- Opus review fixes (3D): a device tap right after a missed floor tap opens its popup and cancels the room pick; a
  deferred room pick is dropped if the floor or the pick changed in its 350 ms window; an unavailable device keeps its
  dashed warn ring instead of the idle disc.
- Open: at 375 px a long outdoor name ("Garden pond" in the demo) can end 1.4 px under the control stack
  (`card-label-bounds.spec.ts`).
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
