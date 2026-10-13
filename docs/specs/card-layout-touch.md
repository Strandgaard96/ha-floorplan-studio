# Card layout and touch

Status: planned 2026-10-13 for 0.29.0 (Sprint 31). Waits for Diego's yes on the four decisions below. Plan:
`docs/PLAN.md`, Sprint 31.

## Why

Roadmap row 31, from Diego's review of 2026-10-08 (81 findings; direction: "one side sheet in the card (Overview ›
Floor › Room › Device)", "chrome sits beside the plan, not over it"). Sprint 24 built the Overview's content. Its
frame is still the one of 0.12: every control floats over the plan.

What the card does today (0.28.1, read from `src/card/floorplan-studio-card.ts`):

- Floor chips top left, the look toolbar (View, Tilt, Walls, Theme, Labels, Names, Floor below) top right, the zoom
  stack (+, −, Fit, rotate left, rotate right, Reset view) under it. All `position: absolute` over the `<svg>`.
  `_positionToolbar` moves them about when they collide.
- The Overview is a floating panel, `min(200px, 45%)` wide, dragged by its header, folded under 480 px. With a room
  picked on a card under 480 px it becomes a short sheet (45 % high) docked where it hides the least of the room.
- The device popup floats beside the icon or beside the row. On a phone it may cover what it located (DECISIONS
  2026-10-08, S24.7, last line).
- Chrome buttons are 28 px. Overview rows are 40 px under `pointer: coarse`; the popup's primary button is 44 px.
- Height: in masonry the card is as tall as the plan at the column's width, so a tall plan runs past the screen.
  Sections rows and the panel view are bounded.
- Keys: arrows pan, `+` `-` zoom, `[` `]` turn, Space resets, `/` and ⌘K search, Escape closes. No device on the plan
  can take focus; a keyboard user reaches a device only through search or a list row.

The review's full list of 81 findings is not in the repo or in Cairn. Ids are cited only where `docs/PLAN.md`
already names them (C3, G1, F1 and so on).

## Goal

On a wall tablet (768 x 1024) and a phone (390 x 844), from a cold card, the common jobs take the tap counts below,
every tap lands on a 44 px target that is the real top element, and nothing the user needs is under a control.

## Non-goals

- The Studio. Its chrome, its touch targets and its keys are out of scope. Every piece of this sprint is card
  chrome: it sits outside the `<svg>` that `renderFloor` draws, so the plan stays one draw path (finding 8) and the
  Studio needs no twin. Studio parity is about **viewing** controls: each Studio view control keeps a row in the
  card's table (`view-parity.spec.ts`); rows change where the control lives, not whether it exists.
- New YAML keys. No `fit`, no `sheet`, no `layout` key. Existing keys keep their meaning (below).
- Sprint 32's extras: saved views, favourites, heat map, `tap_action`.
- Centring the 3D camera on a device. In 3D a locate switches floor and opens the device level, as today.
- Landscape phone gets the layout its width gives it (844 wide is a side sheet); no special case.

## Decisions for Diego

Each has the default this plan builds and the alternative. Until he answers, the defaults stand as assumptions
(DECISIONS 2026-10-13).

### D1. Where the chrome goes

**Default.** Three bands, nothing over the plan but a small zoom cluster:

1. A **header bar** above the plan, 52 px: floor tabs on the left (scroll sideways when they do not fit), then on the
   right a **Search** button and a **⋯** button ("View options").
2. One **sheet**: Overview › Floor › Room › Device, with a back arrow and a crumb. At a card width of 640 px or more
   it is a **side sheet** on the left, `clamp(260px, 32%, 320px)` wide, beside the plan. It folds to a 52 px rail (a
   button with the alert count). It starts open at 900 px or more and folded below. On a phone (under 640 px) it is a
   **bottom sheet** (D2).
3. The **plan** takes what is left. A zoom cluster (+, −, Fit; Reset camera in 3D) sits on it, bottom right.

The device: on a side-sheet card a tap on the plan opens today's popup beside the icon (fast, near the finger), and a
row tap opens the Device level in the sheet. On a phone both open the Device level in the bottom sheet; no popup
floats.

**Alternative.** Keep today's floating Overview from 640 px up and only add the phone bottom sheet and the header
bar. Less work, but chrome still covers the plan on a tablet, which the review's direction rules out.

### D2. The phone bottom sheet

**Default.** Three heights, by drag or by tap on the handle:

- **Peek**, 64 px: the handle and one line, "Home › Ground · 2 alerts · 6 lights". It sits under the plan, not over
  it.
- **Half**: `max(50 %, 340px)` of the card, capped at the card less the header bar. A room pick, a floor tab tap and a
  device tap or locate open it here.
- **Full**: the card less the header bar. Search opens here.

A drag snaps to the nearest height; a fling of more than 0.5 px/ms goes one height in its direction. A tap on the
handle goes peek → half → peek, or full → half. The back arrow and Escape go up one level (Device → Room → Floor →
Overview), and from Overview to peek. When the sheet opens on a room or a device, the plan pans so that thing stands
in the part of the plan the sheet leaves visible. Reduced motion: the sheet jumps, no slide. The height is not
remembered across reloads; the level is not either (a cold card is at peek, Overview).

On a phone the card is at least `min(100dvh − HA header, 640px)` tall while it has a sheet, so half has room for a
room's Lights off without scrolling. The plan letterboxes in what the header and the peek leave.

**Alternative.** Two heights, peek and full, by tap only, no drag. Simpler (no gesture code, no fling), but every
level covers the whole plan, so a room's lights cannot be seen while they are switched.

### D3. What goes in the ⋯ menu

**Default.** Everything about how the plan looks, in this order: View (2D, 2.5D, 3D, as three buttons), Tilt (2.5D),
Walls (2.5D and 3D), Floor below (2D and 2.5D) or Floors below (3D), Theme, Labels, Device names, Detail (Auto, Full,
Minimal), Layers (the family chips), Rotate left, Rotate right, Reset view. Layers and Detail leave the Overview. What
stays outside: floor tabs and Search (header), Turn off on this floor and All floors (sheet), +, − and Fit (cluster).
It is a menu button with `aria-haspopup="menu"`; on a phone it opens as a full-width panel under the header.

**Alternative.** Only the rarely used in ⋯ (Theme, Walls, Tilt, Labels, Names, Detail, Layers, Reset view); View and
the rotate pair stay as header buttons. One tap less to change view, one row more of header on a phone.

### D4. Keys on the plan

**Default.** The plan is one Tab stop (`tabindex="0"`, `role="group"`, `aria-label="Floor plan, <floor>"`). Tab in
and the device nearest the view's centre takes focus, shown by a ring drawn as card chrome (like the locate pulse)
and read by a hidden `role="status"` line ("Kitchen spot 1, light, on"). Then:

- arrows move focus to the nearest drawn device in that direction on screen (so a turned plan works);
- Enter or Space opens its popup (side-sheet card) or its Device level (phone); Enter again presses the primary
  button, as focus is on it;
- Escape leaves device focus; the plan stop keeps focus;
- Shift + arrows pan, always. Plain arrows pan only while no device has focus (hovered card, today's behaviour);
- `+` `-` `[` `]` `/` ⌘K are unchanged; Space resets only while no device has focus.

A device off the visible part pans into view when it takes focus. Hidden devices (Layers, Detail) are skipped. Focus
survives a `hass` update and is dropped on a floor switch.

**Alternative.** Every device a Tab stop in reading order; arrows always pan. No new arrow rule, but 182 Tab presses
cross the stress house's ground floor.

### Assumption, not asked: fit to height

The card is never taller than the screen. In masonry and with `rows: auto`, its height is
`min(plan height at its width + chrome, visual viewport height − HA header − 16px)`, and the plan letterboxes. Sections
with numeric rows and the panel view keep their own bound. The phone minimum of D2 applies. If Diego wants the old
"as tall as the plan" back, that is a `fit: width` key later.

## What existing keys do in the new frame

| Key | Effect |
|---|---|
| `kiosk: true` | No header bar, no sheet, no ⋯, no cluster unless `zoom` and `rotate_switch` bring them. A tap opens the popup, as today. Fit to height applies. |
| `active_list: false` | No sheet. The header keeps tabs and ⋯; Search is hidden (its results open in the sheet). The device popup floats on every width. |
| `view_switch: false` | ⋯ loses View, Tilt, Walls, Theme, Labels, Names, Floor below. With nothing left, no ⋯. |
| `rotate_switch` | Rotate left and right in ⋯ (or alone in it). |
| `zoom: false` | No cluster. |
| `floor` pinned, one floor | No tabs. |

## Accessible names (the tests use these, so the builders must)

Header: `button "Search"`, `button "View options"` (`aria-haspopup="menu"`, `aria-expanded`), floor tabs as today
(`aria-pressed`). Sheet: `region "Overview"` (or the room's or device's name), `button "Back"`, `button "Fold
overview"` / `"Open overview"` (rail), phone handle `button "Overview"` with `aria-expanded`. Menu: `menu "View
options"`, items `menuitemradio` (View, Theme, Detail), `menuitemcheckbox` (Labels, Device names, Floor below, each
layer), `menuitem` (Rotate left, Rotate right, Reset view). Cluster: `button "Zoom in"`, `"Zoom out"`, `"Fit"` (or
`"Home view"`).

## Acceptance criteria

The tap tasks run on `tests/fixtures/stress-layout.json` with the states of `card-find.spec.ts`, config
`{ layout, theme: "light" }`, the real Detail default (`window.__realDetailDefault`), storage cleared, ground floor
shown. Tablet: viewport 768 x 1024. Phone: 390 x 844. Both with `hasTouch` and `isMobile`, so `pointer: coarse`
matches. A tap is one `page.touchscreen.tap` at a point where the target is the top element (`elementFromPoint` in
the card's shadow root). Typed letters are counted apart. No `waitForTimeout`; waits are on a state.

| # | Task | Tablet | Phone | Today (S31.1 measures) |
|---|---|---|---|---|
| K1 | Turn off the Kitchen's lights: the room, then Lights off | 2 | 2 | about 2 / 3 |
| K2 | Find "Guest bedroom bedside left" (Second floor, off) and turn it on: Search, type "guest bedside left", the first result, Turn on | 3 | 3 | about 3 / 4 |
| K3 | Turn off what is on on the First floor (`light.study_desk_lamp`): its tab, Turn off on this floor, Turn off 1 | 3 | 3 | about 3 / 4 |
| K4 | Show the plan in 2.5D: View options, 2.5D | 2 | 2 | 2 / 2 (a select) |
| K5 | Operate a lit device seen on the plan (`light.kitchen_spot_1`, Ground): its icon, Turn off | 2 | 2 | 2 / 2 or 3 |

1. **K1 to K5** hold at the counts above, each ending in the exact `callService` calls (copied from what the card
   sends today, finding 21). After K2 on the phone the device's icon box lies inside the plan's visible part, not
   under the sheet (fixes the S24.7 note).
2. **Nothing over the plan.** At 1280 x 900, 768 x 1024 and 390 x 844, no chrome box intersects the plan's box except
   the zoom cluster, an open popup, an open ⋯ menu, the bottom sheet above peek, and dialogs. Measured from
   `getBoundingClientRect`.
3. **44 px.** Under `pointer: coarse`, every button, select, input, `[role=button]`, `[role^=menuitem]`, summary and
   checkbox row in the card's shadow root and in `<fp-search>` has a box at least 44 x 44 (inputs and selects: at
   least 44 high), and no two such boxes overlap, in each state: Overview, Floor, Room, Device, ⋯ open, the off
   dialog, the chooser dialog, the rail. Under a fine pointer the same controls keep their desktop size (a
   `getComputedStyle` pair per rule, finding 10). A presentation attribute is never the behaviour (finding 18).
4. **Fit to height.** On the demo and the stress house, at 1024 x 768, 768 x 1024 and 390 x 844, in a masonry-like
   harness (auto height), the card's bottom is at or above the viewport's bottom less 16 px, and every outline corner
   of the floor is inside the plan's box. Sections with numeric rows and `:host([panel])` give the same box as in
   0.28.1.
5. **Side sheet.** At 640 px and up the Overview is beside the plan; folding it widens the plan; the fold is kept
   per card (the `fp-active-panel:` entry's fold; its old `x`, `y` are dropped). Room pick, floor tab and row tap
   open the right level; Back goes up one; a `hass` update keeps the level, the scroll and the fold.
6. **Bottom sheet.** Under 640 px: peek, half and full as D2, by a real drag on the handle (`page.mouse` down, moves,
   up) and by taps; a fling goes one height; Back and Escape step up; reduced motion leaves no running transition.
   A `hass` update mid-drag keeps the drag. A floor switch with the Device level open goes to the Floor level.
7. **⋯ menu.** Opens with a tap, Enter or Space; arrows move, Home and End jump, Escape closes and gives focus back to
   the button; a tap outside closes it. Every item changes what the old control changed and is remembered the same
   way (view memory, `fp-view:`). `view-parity.spec.ts` passes with the card.md table updated.
8. **Keys on the plan** as D4, with real `page.keyboard`: Tab reaches the plan in one press from the last header
   control; arrows reach a device to the right, left, above and below on a plan turned 45 degrees; Enter opens,
   Escape leaves; Shift + ArrowRight pans and leaves focus; no key acts while a text field has focus; a second card on
   the page takes no key.
9. **Old configs.** `kiosk`, `active_list: false`, `view_switch: false`, `rotate_switch`, `zoom: false`, a pinned
   floor and a one-floor layout give the table above. Each has a test.
10. **No regressions.** The full suite passes; tests that read old chrome selectors (`.fp-zoom`, `.fp-stack`,
    `.fp-active` position) are moved to the new names in the same commit, each move named in the task report
    (finding 19: a changed default breaks pinned tests; fix the test's premise, not its number).
11. **Budget.** The card file stays within the size test's limit; the stylesheet comments are stripped as today.
12. **Shots.** `npm run shots` gains the card at 768 x 1024 and 390 x 844 (Overview, Room, Device, ⋯ open; bottom sheet
    at peek, half, full), in blueprint, light and ha-dark. Looked at (finding 16).

## Hostile cases

Two cards on one page (menus, sheet and keys belong to their own card; one popup at a time across cards, as today); a
`hass` update during a drag, a menu, a focus ring; a floor switch with the sheet at Device; `setConfig` mid-session
(sheet back to Overview, focus dropped); a device rotated from portrait to landscape (768 to 1024 wide, 390 to 844
wide) crosses no state it cannot keep; storage that throws; a layout with one room and no devices; a floor with 182
devices and the phone's half sheet; a name with `"><script>` in the crumb, the status line and the menu (Lit text
bindings, finding 2).

## Risks

- The card file is 3 668 lines and every wave-2 task edits it. They run in order, one coder at a time.
- Many existing Playwright tests click chrome at known spots. S31.5 budgets the migration.
- The size test has a fixed limit (115 000 bytes gzip). S31.1 measures the headroom before anything is built; under
  6 KB the coordinator asks Diego before wave 2.
