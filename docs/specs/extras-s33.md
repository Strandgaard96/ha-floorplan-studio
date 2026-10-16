# Extras: Sprints 33 and 34

Status: Approved by Diego 2026-10-15 with the defaults for Q1 to Q6. Drafted 2026-10-15.
Plan: `docs/PLAN.md`, Sprint 33 (full) and Sprint 34 (outline).

## Why

Roadmap row 33 (2026-10-08 review, moved from row 30 and row 32) lists six extras with no further text: saved views,
favourites, heat map, dashboard strategy, `tap_action`, fan type. Diego, 2026-10-15, asked whether six unrelated
extras should be split.

## The split

Six items, one exit test each, is six sprints' worth of review surface in one release. They share no code path.

- **Sprint 33, 0.31.0: fan type, `tap_action`, saved views, dashboard strategy.** Each has one clear reading and can
  be built on the defaults. The two schema touches (a new `DEVICE_TYPES` member, a new optional `Layout.views`) land
  together, so one Opus pass reviews `validate`, `migrate` and the writers once. The two new YAML surfaces
  (`tap_action`/`hold_action` on the card, the strategy's own config) land together, so `docs/card.md` and the
  Edit-card form change once.
- **Sprint 34, 0.32.0: favourites, then heat map.** Neither has one reading (Q2, Q3). Both add a new thing to the
  card's chrome or plan and need Diego's answer before a test can be written. Heat map is the heaviest item (a new
  overlay through `renderFloor`, a Studio twin, possibly the recorder's history) and goes last, alone in its lane.
- **Drop:** a presence heat map "over a day" (the reading in PLAN's "Later, not planned"). It needs the recorder's
  history for every motion entity on every load, a time scrubber, and a new aggregation; the plan already shows motion
  live. The default heat map is the cheap one (Q3).

## What the code does today (0.30.0)

- `DeviceType` and `DEVICE_TYPES` (`src/core/schema.ts`) have 32 members. No `fan`. `typeForEntity` (`src/core/ha.ts`)
  types a `fan.*` entity as `other`; `ac`'s doc says "air conditioner, heat pump, fan or air cleaner". About 30 tests
  iterate `DEVICE_TYPES` and pin a per-type table (findings 17, 20): `NO_TOGGLE` (`src/card/actions.ts`),
  `ROOM_ROW_TAP`, `FLOOR_OFF_GROUP`, `ATTENTION_RULE`, `ACTIVE_LIST_RULE`, `CATEGORY_OF`, `DEVICE_Z`,
  `UNLINKED_HEIGHTS`, `DEVICE_SOLID`, `DEVICE_ICONS`, `DEVICE_COLOURS`, the type menu, the popup rules, and more.
  Two lists are copies, not imports: `src/card/three/palette.ts` and `tests/core/icons.test.ts`.
- `SCENE_DOMAINS` already holds `fan` with `percentage`: a scene can set a fan's speed. The card has no fan icon.
- A tap never operates (S14.2, 2026-10-06): it opens a popup; a hold opens more-info. `docs/card.md` says "`tap_action`
  is not a card option and the popup does not read one". OFF asks first for every type but a light.
- The card remembers each viewer's view per browser (`src/card/view-state.ts`, `StoredView`, `FloorView`: zoom, focus,
  rotation, 3D camera per floor; view, tilt, walls, theme, floor). The Studio keeps its own (`src/editor/view-memory.ts`).
  "Copy card view" in the Studio writes a card's `center` and `zoom_level`. Nothing names a view or shares one.
- File, Install code in the Studio writes a dashboard YAML to paste. It is a snapshot: a floor added later is not in it.
  The integration's websocket has `floorplan_studio/load` (any user, replies `{ layout }`), `save` (admin), `version`.
- The Overview sheet (card only) lists Attention and Active by floor. The Studio has an Outline instead.

## Decisions (the defaults this plan builds)

### X1. Fan is a device type

`fan` joins `DeviceType` and `DEVICE_TYPES`, after `alarm` (order matters to the Active list grouping). No schema
version bump: an older card refuses the type in `validate`, and HACS ships card and Studio together; the open-page
version check already asks an old page to reload.

| Table | Fan's entry | Why |
|---|---|---|
| `typeForEntity`, `TYPE_RULES` | `fan.*` is `fan`; `fan` matches the `fan` domain | the domain says it |
| `DEVICE_ICONS` | `mdi-fan`, path inlined (finding 9) | no runtime `@mdi/js` |
| colour | `--fp-dev-fan`, own colour in every theme, solid when on | off quiet, on solid (Sprint 23); finding 17 |
| `NO_TOGGLE` | not in it: the popup offers Turn on and Turn off | a person switches a fan (finding 20) |
| popup OFF | asks first, as every non-light | S14.2 rule unchanged |
| `ROOM_ROW_TAP` | `toggle` | as switch and plug |
| `FLOOR_OFF_GROUP` | new group `fans`, label "Fans", after `plugs` | All off should reach a fan, named as such |
| `ACTIVE_LIST_RULE` | `on` | |
| `ATTENTION_RULE` | `none` | a running fan is not an alarm |
| `CATEGORY_OF` | `climate` | |
| `DEVICE_Z`, `UNLINKED_HEIGHTS` | as `light` (ceiling) | most placed fans are ceiling fans; `z` overrides |
| `DEVICE_SOLID` | `none` | as `light` |
| unlinked menu | offered | a fan with no entity is still a drawing |

Existing devices typed `other` or `ac` on a `fan.*` entity are not retyped (no migration guesses). The device panel's
type field changes them; `docs/card.md` says so.

Speed: when the entity has a `percentage` attribute and `supported_features & 1` (SET_SPEED), the popup shows a speed
slider (0 to 100 %, step from `percentage_step`, else 1). Moving it changes the number only; release makes one
`fan.set_percentage` call, as the light's brightness slider does.

### X2. `tap_action` and `hold_action`, card-wide

Two new card keys, Home Assistant's own action shape, read for **device icons** only (doors, appliances and linked
furniture keep what they do):

- `tap_action: { action: popup | more-info | toggle | none }`. Absent, or anything else, is `popup` (today).
- `hold_action: { action: more-info | none }`. Absent is `more-info` (today). Kiosk still never holds.
- `toggle` turns ON at once. It turns OFF at once only for a light; for any other type it opens the popup with the
  Confirm turn off step already showing (the S14.2 safety rule stands). A `NO_TOGGLE` type, a vacuum, a media player
  and a device with no state open what `popup` opens. A stack still fans out first.
- `navigate`, `url`, `perform-action`, `call-service`, `assist`, `fire-dom-event`: not supported (they mean one target
  per card, which a plan of 400 devices is not). Treated as absent, with one console warning per card naming the key.
- Untrusted YAML (finding 1): a string (`tap_action: toggle`) is read as `{ action: toggle }`; anything else that is
  not an object with a known `action` is absent. Never throws.
- The Edit-card form gets two selects (Tap: Popup, More info, Toggle, Nothing; Hold: More info, Nothing). A default
  is left out of the saved YAML.
- Studio parity: none, on purpose. A click in the Studio selects; it is an editor.

### X3. Saved views, in the layout

A saved view is a named way of looking at the plan that the Studio saves into the layout and every card offers.

- Schema, optional, no version bump: `Layout.views?: SavedView[]`, at most `MAX_VIEWS` = 24.
  `SavedView = { id: string; name: string; floor: string; mode?: "2d" | "2.5d" | "3d"; rotation?: number;
  zoom?: number; center?: [number, number] }`. `id` a non-empty string of at most 64 characters, unique among views, `name` 1 to 60
  characters, `floor` a key of `floors`, `rotation` a multiple of 45 in 0..315, `zoom` 1 to `MAX_ZOOM`, `center` two
  finite numbers within `COORD_LIMIT`, and `zoom` and `center` together or not at all. No 3D camera in this sprint.
- `validate` checks every field and never throws (finding 1). `migrate` copies only known top-level keys today, so it
  must learn `views`: it drops a `views` that is not an array and drops
  each entry that would fail (a view is a convenience; it must never cost the plan, as `dropBadHeights`), so a stranger's
  file opens without its bad views and `validate` still judges what is left.
- Writers (finding 12): Delete floor drops the views on that floor in the same undo step. A test runs every floor
  operation (add, rename, delete, move, replace) on a layout with views and checks `validate` passes after each.
- Studio: View menu, a **Saved views** submenu (`#viewsSub`): "Save current view…" (asks a name; stores the floor on
  show, the turn, and zoom and centre when the floor is not shown whole; "Open in" select: Viewer's choice, 2D, 2.5D,
  3D, default Viewer's choice), then one item per view on the shown floor's top (apply), each with Rename and Delete in
  its context menu. Save, rename and delete are one undo step each; applying is not an edit.
- Card: the ⋯ menu gets a **Views** section when the layout has any, one radio-like item per view (`data-value`
  `view:<id>`), names escaped (finding 2). Applying one is a viewer's pick: floor, then mode, then rotation, then zoom
  and centre (2D and 2.5D; in 3D the floor's framed camera), written to view memory like any pick. Reset view returns
  to the config, not to a saved view. Shown under `view_switch: false`; hidden under `kiosk`.
- Parity (memory rule): Studio and card both have it. `view-parity.spec.ts` gets the row `viewsSub` → `view:<first id>`.

### X4. A dashboard strategy

Home Assistant builds a dashboard from a strategy element when the dashboard's raw config says
`strategy: { type: custom:floorplan-studio }`. The card bundle defines `ll-strategy-dashboard-floorplan-studio`
(through `defineElement`, for the registry race of S8.3) with `static async generate(config, hass)`.

- It loads the layout with `floorplan_studio/load` (reply `{ layout }`, copied from `websocket.py`, finding 21), runs
  `migrate` and `validate`, and returns `{ title: "Floorplan", views }`: one panel view per floor, in the layout's
  order, `title` the floor's title, `path` a slug of the key, its card `{ type: custom:floorplan-studio-card, floor:
  <key> }`.
- `config.card` (an object) is merged into every card (`theme`, `view`, ...), never over `type` or `floor`.
  `config.title` replaces the dashboard title. Junk is ignored, never thrown on.
- No layout, a load error or a layout that fails `validate`: one view with one markdown card that says what failed
  and what to do (install the integration, save from the Studio once).
- A floor added in the Studio shows up on the next dashboard load. That is the point of a strategy over Install code.
- Studio: File, Install code shows a second block, "Or as a strategy", with the three lines. No other Studio twin: a
  strategy is not a view control.
- Risk: the custom strategy API is not part of HA's documented, versioned card API. The release step tries it on
  Diego's HA and reads the generated dashboard back.

### X5. Favourites (Sprint 34, outline)

Reading: a short list of devices a person reaches first. Default (Q2): a card key `favourites: [entity ids]`, shown
as a Favourites section at the top of the Overview (above Attention), each row the device's state and its primary
button, and ranked first in Search. Card only: the Overview is card chrome; the Studio has its Outline. A row for an
entity not on the plan is dropped. At most 24.

### X6. Heat map (Sprint 34, outline)

Reading (Q3): each room filled by its current mean temperature (`Room.temps`, the same `meanReading` the readout
uses), on a cold-to-warm ramp, as a mode of the plan: off, temperature, humidity. Drawn by `renderFloor` (finding 8),
so the Studio shows it too, from its View menu (memory rule). Card key `heat_map: off | temperature | humidity`, a
⋯ menu item, remembered per viewer. A room with no reading keeps its own fill. Not in 3D in Sprint 34.

## Acceptance criteria

Sprint 33:

1. A `fan.*` entity added from a room's area menu is typed `fan`, draws the fan icon, and is solid `--fp-dev-fan` when
   on and quiet when off, in every theme (`npm run shots`, looked at).
2. Every test that iterates `DEVICE_TYPES` names `fan` with the decision in X1; with `fan` removed from any one table,
   that table's test fails.
3. A real click on a fan's icon opens its popup; Turn on calls `fan.turn_on`; Turn off asks first, then calls
   `fan.turn_off`. A fan with `percentage` 40 and SET_SPEED shows a slider at 40; a real drag to about 70 and release
   makes exactly one `fan.set_percentage` call with the value under the pointer.
4. All off on a floor with a fan on lists it under Fans and turns it off with the rest.
5. With `tap_action: { action: toggle }`, a real click on an off light calls `light.turn_on` and opens no popup; on an
   on plug it opens the popup at Confirm turn off and calls nothing; on a temperature sensor it opens the popup.
6. With `tap_action: { action: more-info }` a real click fires `hass-more-info` for the device's entity; with
   `none` it does nothing; with `hold_action: { action: none }` a 600 ms hold does nothing.
7. Junk `tap_action` and `hold_action` (a number, `__proto__`, an unknown action, `navigate`, an array) behave as
   absent, warn once, and never throw.
8. `validate` accepts a layout with views and rejects, without throwing, each junk view field (non-array `views`, 25
   views, a duplicate id, a view on a missing floor or on a floor named `__proto__`, `zoom` without `center`, `NaN`, a
   rotation of 30). `migrate` drops the bad entries, keeps the good ones, and keeps `views` at all. A name of
   `"><script>` is valid and is escaped wherever it is drawn (finding 2).
9. In the Studio, Save current view, then Delete floor, then Undo: the view is gone with the floor and back with Undo;
   `validate` passes after every floor operation on a layout with views.
10. In the card, a real click on a saved view in the ⋯ menu switches to its floor, mode, turn and zoom; a reload keeps
    it; Reset view returns to the config.
11. `generate` on a three-floor layout returns three panel views in order, each with its pinned card and the merged
    `card` options; on no layout, a load error or an invalid layout it returns one view that says why. The strategy
    element is defined once the card's script has loaded, on both registries (S8.3).
12. `npm run lint`, `npm test`, `npx playwright test`, each bare, `$?` on its own line; every new Playwright test
    `--repeat-each=10`.

Sprint 34 criteria are written when Q2 and Q3 are answered.

## Non-goals

- A 3D camera in a saved view; a card writing views back to the layout; per-viewer saved views.
- Per-device `tap_action` in the layout; HA actions other than `popup`, `more-info`, `toggle`, `none`.
- Retyping existing `fan.*` devices; a spinning fan animation.
- A view strategy (`ll-strategy-view-...`); a strategy that also adds other cards.
- A presence heat map over a day (dropped, above).
- Schema v3.

## Risks

- **The fan type touches about 30 tables.** Mechanical but wide. The iterating tests make each one a red line, so the
  coder works down the list; the two copied lists (`palette.ts`, `icons.test.ts`) do not fail on their own and are
  named in the brief.
- **An older card and a new layout.** 0.30.0's `validate` refuses a device of type `fan`, so a page still running
  the old script reads "No layout" until it reloads (the version check asks it to). `views` is safe the other way:
  `migrate` (`src/core/migrate.ts`) rebuilds the layout from known keys only, so an older card drops `views`
  silently. The same line means the new `migrate` must pass `views` through, or the Studio loses every saved view on
  the next load: S33.6's test reloads a saved layout and finds its views. The CHANGELOG says both.
- **The card file is 4,000 lines** and three lanes touch it (tap action, saved views, strategy's registration). They
  run in sequence on it; see the plan.
- **Strategy API drift.** Tested by a unit test against the shape HA calls, and by hand on Diego's HA at release.

## Open questions for Diego (each with the default this plan builds)

1. **Saved views: shared or personal?** Default: in the layout, saved in the Studio, offered by every card to every
   viewer. Other: per viewer, in the browser, saved from the card's ⋯ menu (no Studio twin, no schema change).
2. **Favourites: where kept?** Default: a card key `favourites:` listing entities (one list per dashboard card,
   written in YAML or the Edit-card form). Other: per Home Assistant user, starred from the popup and kept with HA's
   `frontend/set_user_data`, so it follows the person across devices.
3. **Heat map: of what?** Default: rooms filled by their current mean temperature (or humidity), no history. Other:
   presence over a day from the recorder (this plan recommends dropping it).
4. **Dashboard strategy: what does it build?** Default: one panel view per floor, each card pinned to its floor.
   Other: one panel view with the floor switcher.
5. **`tap_action` scope.** Default: card-wide, device icons only, `popup`, `more-info`, `toggle`, `none`; OFF still
   asks for non-lights. Other: also per device in the Studio (a schema field), or HA's full action set.
6. **Fan: in All off, and which default height?** Default: All off has a Fans group; a fan hangs at the ceiling, as a
   light. Other: fans left out of All off; a floor-standing default height.
