# Card UI refactor (2D, 2.5D, 3D)

Status: agreed 2026-10-11. Source: a Refactoring UI review of the card shots
(score 3/10), Magnus: "Fix all. But devices that are off are not noise. The 3D
view is meant to be a way to control lights and other entities."

## Goal

The card reads at a glance and every entity stays reachable. The plan is not
covered by chrome, a tapped device stays in view, there is one alert colour
language, and the card's look comes from one small set of type, spacing,
radius and shadow tokens. Nothing a viewer can control today becomes harder to
reach.

## Principle

Devices that are off are controls, not clutter, in every view. No change may
hide an idle device that is drawn today at the same zoom and detail setting.

## Decided

### Shell (lane `ui-shell`, `src/card/floorplan-studio-card.ts`, `src/card/popup*.ts`)

1. **The Overview panel starts folded** at every width: one line with the
   breadcrumb and the summary chips ("2 alerts · 2 lights …"). A tap on the
   line opens it. The viewer's open or folded pick is remembered per viewer,
   like the other view picks. A picked room still opens the room panel. Its
   text is never clipped mid-line: a body that does not fit scrolls, and a
   line that does not fit wraps or ends with an ellipsis.
2. **The popup sits beside the device it was opened from** and never covers
   that device's icon. It takes the side (right, left, below, above) with the
   most room and stays inside the card. Below `ACTIVE_FOLD_BELOW_PX` it keeps
   the full-width sheet, on the half of the card away from the device. In 3D
   the device's screen point is the anchor.
3. **One toolbar.** View is a segmented control (2D, 2.5D, 3D), not a select;
   a view a card config does not offer is not shown. Every other look control
   (walls or cutaway, floors below, theme, tilt, labels, names, and the
   Floor below ghost button) lives in the View options menu at every width,
   not only below 480 px. Tilt has a visible label. The theme stays a viewer
   pick, inside that menu.
4. **Reset view is hidden, not disabled,** until the view differs from its
   start, and its space in the stack collapses. Keyboard focus never lands on a
   hidden button.

1a. **The default detail is `full`.** With `detail` unset the card draws every idle device at every zoom (it drew 8 of 26 on a
    main floor and none of a basement's 17 at the default zoom). An explicit `detail: auto` and the viewer's own pick win.
1b. **Switching floor does not open the floor panel.** A pill of another floor only switches; the Overview keeps its state. The
    floor panel opens from a tap on the pill of the floor already shown.
1c. **No unit after a non-numeric state** (`unavailable`, `unknown`, a word) anywhere the card prints a value with a unit.
1d. **Short panel times.** "since 19:55" today, else "since 10 Oct 19:55"; the full timestamp in a `title`.

### Plan (lane `ui-plan`, `src/core/render.ts`, `src/core/theme-roles.ts`, `src/core/spider.ts`, `src/core/detail.ts`)

5. **Far-zoom dots carry their glyph.** At far detail a device that is drawn
   as a dot shows its icon inside, in ink that meets 3:1 against the dot,
   so the type reads in grayscale. The far rules for which devices are drawn do
   not change.
6. **One red.** `--fp-danger` red is for alerts only: an open door's hatch, an
   armed or triggered alarm, leak, smoke, a jammed lock, unavailable where it is
   red today. Motion (rings, dots, the motion badge count) takes its own
   non-red role, distinct from lights. A room that is in alert keeps one red
   outline; its devices do not add a second red ring for the same alert.
7. **HA dark walls are mid grey**, not white: still at least 3:1 against the
   floor and the room fill, but no longer the highest-contrast thing on the
   plan. Other themes are unchanged unless they have the same fault.
8. **The stack fan never overlaps** at any zoom: the ring radius grows with the
   drawn icon size, so members and their name tags are apart at near, mid and
   far.

### 3D (lane `ui-3d`, `src/card/three/*`)

9. **Off devices read and tap as well as on ones.** Same marker size as an on
   device; an opaque disc in `--fp-disc` with the glyph in the idle ink at full
   opacity, at least 3:1 against the disc, and a thin edge so the disc reads on
   any floor colour. Nothing about an idle device is hidden.
10. **3D labels are chips like 2D's**: room names and readouts sit on the same
    tag background as the 2D labels, so they read on walls, floors and ground.
11. **The house fills the view.** The default camera frames the house's box so
    it fills about 85 % of the card's free area (the area under the toolbar),
    in every floor, with floors below on or off.
11a. **The ground has no visible edge.** The 3D ground fades to transparent toward its border, so on a light Home Assistant
    page with a dark theme (blueprint) it is not a dark stripe with white bands above and below; in every theme, day and night.
11b. **A room's readout never outlives its name.** The declutter keeps a room's readout only when the same room's name stays
    (readout dropped first).

### System (lane `ui-system`, runs after shell and plan are merged)

12. **Type scale 12 / 14 / 16 px.** 12 for secondary text and badges (no text
    under 12 px anywhere in the card), 14 for body, rows and room names on the
    plan (semibold), 16 for panel and popup titles. `em` sizes become px on
    this scale.
13. **Spacing 4 / 8 / 12 / 16 / 24 px**, radii 6 px (controls) and 12 px
    (surfaces: panel, popup, dialog, tooltip) plus 999 px pills. As CSS custom
    properties (`--fp-space-*`, `--fp-radius-*`) on the card host.
14. **Shadows are two tokens,** `--fp-shadow-sm` (controls) and `--fp-shadow-lg`
    (panel, popup, dialog, tooltip), each a tight and a soft layer, coloured
    from `--fp-ink` with `color-mix`. No `rgba(0, 0, 0, …)` left in the card
    (CLAUDE.md rule 9).
15. **Room panel hierarchy.** Labels (Area, Temperature …) in `--fp-text`,
    values in `--fp-ink`; the section heading ("Devices", "Active in this room")
    outranks the group headings (Lights, Climate …). Built: facts 12 px / 14 px; sections 12 px 600 capitals in ink, groups
    12 px 500 in `--fp-text`.
16. **Popup details.** "More info" and "Details" share the left edge. The hue
    slider's thumb is round like the others.
17. **Outdoor kinds are quiet.** (Magnus, from his live house.) A garden bigger than the house was filled at full strength
    (brownish-mauve on the HA light theme) and outweighed it. Garden, terrace, pavement and water are drawn through
    `--fp-<kind>-fill`, the kind colour mixed into the background, so each is closer to the background than an unpainted
    room is, in every theme, yet still differs from the background and from the other kinds. 2.5D and 3D read the same tokens.

## Not doing

- Hiding idle devices in 3D (rejected by Magnus).
- Moving the theme out of the card's UI.
- Changing which devices each detail level draws.
- New config keys, except what the panel's remembered fold needs internally.

## Acceptance

Each item above has a test that fails with the item removed (CLAUDE.md
findings 4, 5) and, where it changes a pixel, a `getComputedStyle` pair
(finding 10) and shots looked at (finding 16), at 375 and 900 px, light,
blueprint, HA light and HA dark. `task check` and `npx playwright test` run
bare after the last edit. The seven Playwright tests that already fail on this
machine before this work (FORK.md, 0.26.2 sync) are listed, not counted as
new failures, and must not get worse.
