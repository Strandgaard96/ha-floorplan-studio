# Card 3D framing

Status: planned 2026-10-14 for 0.30.0 (Sprint 32). Approved by Diego 2026-10-14, built as Sprint 32. Plan:
`docs/PLAN.md`, Sprint 32.

## Why

Diego, 2026-10-14: "fix all 3". The three gaps `docs/card.md` lists under Known limits:

1. In 3D the camera does not re-fit when the card narrows: a window resize, the side sheet opening or folding, a
   tablet turned, a phone's width changing.
2. On a phone, the bottom sheet at half or full covers the lower part of the house in 3D (at peek it does not).
3. A room pick (a tap on its floor, a row in the sheet, a search result) does not move the 3D camera.

## What the code does today (0.29.0)

Read from `src/card/three/orbit.ts`, `src/card/three/view3d.ts` and `src/card/floorplan-studio-card.ts`.

- `Orbit` holds `azimuth`, `polar`, `distance`, `target`. Its fit distance is a sphere: `0.85 × radius /
  sin(min(fov, across) / 2)`, radius half the bounds' diagonal, `across` the horizontal field less a left and right
  inset (fractions). The 0.85 means a diagonal view (a plan turned 45 degrees) can cut the house's corners.
- `setAspect` (from the view's ResizeObserver) changes only the distance that Reset returns to. The camera stays,
  so a narrower card cuts the house. That is gap 1.
- `setInset(left, right)` shifts the picture sideways (`setViewOffset`) and scales the distance. The card feeds it from
  `_apply3dInset`, which looked for the old floating panel. Since S31.5 the side sheet is a grid column beside
  `.fp-3d`, never over it, and the bottom frame is skipped, so the inset is always `0,0`. Nothing knows about the
  bottom sheet's height. That is gap 2.
- `_pickRoom` sets the ring and opens the sheet; `_panIntoVisible` skips 3D. Nothing tells the view. That is gap 3.
- The camera is remembered per floor as `Orbit.state()`: `{az, polar, zoom, dx, dz}`, where `zoom` is the distance as
  a multiple of the fit. The card writes it only when `_camMoved` (the person moved it). Reset camera calls
  `_forgetCamera`.
- 2D has the rule we want: `_visibleBox()` is the stage less the bottom sheet at its stop, and `_panBoxIn` pans a box
  into it.

## Goal

At 768 x 1024, 1024 x 768, 390 x 844 and 844 x 390, in 3D, the house (or the picked room) stands inside the part of the
plan the eye can see, after any resize, sheet move or pick, with no fixed wait and no snap of a camera the person has
turned.

## Non-goals

- The Studio. It has no 3D view (`docs/specs/real-3d.md`, decision B: the editor draws 2D only). No twin;
  `view-parity.spec.ts` keeps its rows.
- 2D and 2.5D. Their `_visibleBox` and `_panBoxIn` stay as they are.
- Framing a device. A device found by Search or a row in 3D does what it does today (Q4).
- New YAML keys. No new schema field.
- A camera path, a fly-through, a top-down "plan" camera.

## Terms

- **Stage**: the `.fp-3d` box. The side sheet is its own grid column, so the stage is already the card less the sheet.
- **Cover**: the part of the stage, in px from each edge, that chrome lies over. Today only the bottom sheet:
  `bottom = stage.bottom − (card.bottom − stops[stop])`, at least 0, in `bottom` frame only. Side, top and kiosk
  covers are 0. The stop is read from `sheetStops` (the number), never from the sheet's animated box, so a
  transition in flight does not matter.
- **Visible box**: the stage less its cover. The same rule as 2D's `_visibleBox`, on the 3D stage.
- **Box**: what is framed, in plan cm: the floor's scene bounds, or a picked room (its floor polygon's extent padded
  by 50 cm on each side, from its slab to the floor's wall top).
- **Fit**: the smallest camera distance at which the eight corners of the box, seen at the camera's azimuth and polar,
  all project inside the visible box less a margin of `max(12 px, 5 % of its short side)`, with the box's centre on
  the visible box's centre. Exact, not a sphere: it is found by bisection over the distance, and the picture is moved
  to the visible box's centre by a lens shift (`setViewOffset` on both axes), so the camera still looks at the box's
  centre.
- **Unit**: the fit of the floor box at the start angles (the plan's `rotation`, 50 degrees up). Stored zoom is a
  multiple of the unit, so a stored camera does not depend on the angle it was left at.
- **Framed**: the camera's state is the result of a framing step (first draw, Reset camera, floor switch, focus,
  unfocus) and the person has not dragged, wheeled or pinched since. Restore of a stored camera is not framed.

## Decisions (the defaults this plan builds)

### F1. A new visible box

When the visible box changes (the canvas resized, the cover changed) by more than 1 px on any edge:

- **Framed camera**: run its framing step again, at its current angles, for the new box. The house (or the room) is
  exactly fitted again.
- **Moved camera**: keep the azimuth, the polar and the target. The distance follows the unit:
  `distance × newUnit / oldUnit`. The house shrinks or grows in step with the box; nothing turns or jumps.
- The lens shift always follows the visible box's centre.
- A visible box under 120 px wide or high is ignored: the camera keeps its last framing (the phone sheet at full).
- A canvas resize applies at once (the canvas itself changes size every frame of it). A cover change from a stop
  change eases with the glide below.

### F2. The bottom sheet

The card hands the view its cover after every render and every stop change: `setFrame({ cover, room })`. At peek the
cover is 0 (the peek is its own grid row). At half the house is framed in what is above the sheet. At full the
visible box is under 120 px, so the camera keeps the half framing; back to peek it frames the full stage again. A
drag of the handle does not move the camera; the snap does.

### F3. Room focus

A room pick, from any path (a tap on its floor, a row, Search), focuses the room:

- The camera **glides** to the room's fit inside the visible box at the stop the pick opens (half on a phone; the
  side sheet open on a tablet, which narrows the stage). Azimuth and polar stay; the target moves to the room box's
  centre; the distance is the room's fit, clamped to the orbit's near limit.
- **Glide**: 400 ms, ease-out cubic, azimuth the short way round, distance on a log scale. Under
  `prefers-reduced-motion: reduce` it jumps in one frame. While it runs the view sets `data-easing` on `.fp-3d`, so a
  test waits on a state.
- A **canvas tap** starts the glide when the double-tap window (`DOUBLE_TAP_MS`, 350 ms) has closed and the pick
  stands; the ring and the sheet change at once as today. A double tap therefore never moves the camera. A row or
  search pick glides at once.
- A **drag, wheel or pinch** during the glide stops it where it is. The person has the camera; the focus stays
  (Back still leaves it).
- **Another room** picked while focused glides from where the camera is to the new room.
- **Unfocus**: Back or Escape from the room, the Overview, a tap that clears, a floor tab: the camera glides back
  to the camera it had before the first focus, at the current azimuth and polar (Q3). A floor switch drops the focus
  and frames the new floor as today.
- **Reset camera** drops the focus and goes to the first view; the room stays picked.
- **Memory**: the focus is never stored. While focused, `view.camera()` returns the floor camera: the pre-focus
  zoom and pan with the current angles. A reload never opens zoomed on a room.
- A `hass` update during a glide changes nothing about it (`setFrame` with the same cover and room is a no-op).

### F4. Who computes what

- `src/card/three/frame3d.ts` (new, in the 3D chunk, pure, no three.js import): `fitBox(box, az, polar, fovDeg,
  canvas, visible)` returns `{ distance, target, shift: [x, y] }` or null; `project(...)`, the same maths as three's
  `PerspectiveCamera` with `setViewOffset`; `glide(from, to, t)`. Junk never throws.
- `src/card/three/orbit.ts`: the unit, px cover with a two-axis shift, `frameTo(box)`, the F1 rule (`setVisible`),
  focus and unfocus state, `state()` as the floor camera.
- `src/card/three/view3d.ts`: `setFrame({ cover, room })` replaces `setInset`; the ResizeObserver path runs F1; the
  glide runs in the existing on-demand frame loop and is cancelled by the pointer and wheel handlers; the test hook
  gains `box("floor" | room)`: the eight corners projected by the real camera, as a screen rectangle.
- `src/card/frame.ts`: `coverOf(stage, card, frame, stops, stop)`, pure, beside `sheetStops`.
- `src/card/floorplan-studio-card.ts`: `_apply3dInset` becomes `_apply3dFrame` (cover from `coverOf`, room from
  `_picked()`), the tap path delays the focus by the double-tap window, `_forgetCamera` drops the focus.

The card file is near its budget (109 308 of 115 000 bytes gzip on 2026-10-14); the maths lives in the chunk
(153 594 of 233 000).

## Acceptance criteria

Real `page.mouse`, `page.touchscreen` and `page.keyboard` at real coordinates on the real top element; the demo house,
ground floor, `view: 3d`, storage cleared, at 768 x 1024, 1024 x 768, 390 x 844 and 844 x 390 unless a line says
otherwise. "Inside" means the box from the test hook (the eight corners through the real camera) lies within the
visible box measured from the DOM (`.fp-3d` rect, `.fp-bottom` rect top, `sheetStops`) by at least 8 px on every side.
"Fitted" means inside and at least 85 % of the visible box's width or height. No `waitForTimeout`; waits are on
`data-easing` and `data-drawn`.

1. **First draw.** The house is fitted, at every size, the demo also turned 45 degrees (`rotation: 45`).
2. **Resize, framed.** For each pair 1024 x 768 ↔ 768 x 1024 and 390 x 844 ↔ 844 x 390, a phone 390 → 360 wide, and
   the side sheet folded and opened at 1024 x 768 (a real click on its button): the house is fitted after each.
3. **Resize, moved.** After a real drag of 120 px and three wheel steps in, a resize from 1024 x 768 to 768 x 1024:
   azimuth and polar unchanged (4 decimals), `state().zoom` unchanged (3 decimals), the target unchanged, and the
   house's width over the visible width within 3 % of what it was.
4. **Bottom sheet.** 390 x 844: a tap on the handle (half): the house is fitted above the sheet. A second stop to full:
   the camera is unchanged. Back to peek: the house is fitted to the full stage, within 2 px of the first draw.
   With reduced motion there is no frame between the two framings.
5. **Room focus.** A real tap on the Kitchen's floor, and separately its Search result and its row: after
   `data-easing` clears, the Kitchen's box is fitted in the visible box at the new stop; azimuth and polar unchanged;
   a real click at the projected centre of the room picks the Kitchen (the picture is what the pick sees).
6. **Unfocus.** Escape, Back, and a tap on the background each glide back to the pre-focus camera, within 1 % in
   distance and 1 cm in target. A floor tab drops the focus.
7. **Motion.** Without reduced motion the glide draws at least three frames between start and end; with reduced
   motion it is one frame. A double tap on a room moves the camera not at all. A real drag during the glide ends it:
   no frame after the drag changes the camera.
8. **Memory.** Focus, orbit 60 px, reload: the floor comes back with the orbit's angles and the pre-focus zoom, not
   zoomed on the Kitchen. Reset camera while focused: first view, focus gone, the ring stays.
9. **Hostile.** Two cards on one page: a pick in one moves only its camera. A `hass` update mid-glide: the glide ends
   where it would have. A floor switch mid-glide: the new floor is fitted. A room of 2 points, a room with `NaN`
   corners, a room named `__proto__` and a one-room layout: no throw, no move for the bad rooms. `fitBox` and
   `coverOf` on `NaN`, `Infinity`, negative sizes, a zero canvas and an inverted box return null or a finite answer.
10. **Unit maths.** `project` agrees with three's `Vector3.project` on a `PerspectiveCamera` with `setViewOffset`
    within 0.01 px over 500 seeded cases; `fitBox` makes one side tight within 0.5 px and the other inside; `glide`
    at 0 and 1 is its ends, the azimuth goes the short way across ±π.
11. **No regressions.** The full suite passes. Tests that pinned the old sphere distance or tapped a room twice at
    one point are moved to the new premise in the same commit, each named in the report (finding 19).
12. **Budget.** The card file stays within the size test; the chunk within its limit.
13. **Shots.** `npm run shots`: the 3D shots are looked at in blueprint, light and ha-dark before `--accept`; the new
    framing is named in the report (finding 16).

## Risks

- **Camera maths.** Lens shift signs, three's `setViewOffset` convention and the y-up swap are easy to get wrong.
  Criterion 10 checks the pure maths against three itself, in vitest, before any wiring.
- **Default framing changes.** The exact box fit replaces the 0.85 sphere, so the first 3D picture changes size
  slightly and about ten tests that pin `dist` move (Q5).
- **Card budget.** 5.7 KB of headroom. The card change is estimated under 1 KB gzip; over 1.5 KB the coordinator
  asks Diego.
- **Software WebGL in headless Chromium** is slow; tests read the camera through the hook and wait on states, never
  pixels by the frame.
- **Two observers.** The view's ResizeObserver and the card's `updated()` both report a new size. `setFrame` is
  idempotent by key, and the view reads the canvas size at compute time, so the order does not matter.

## Open questions (each with the default this plan builds)

1. **A moved camera on resize.** Default: it keeps its angles and target, and its distance follows the box (F1); it
   is never snapped back. Other option: after a change of the box's short side of more than 25 % (a tablet turned),
   fit the house again at the current angles, dropping the person's zoom and pan.
2. **Room focus when the room is already in view.** Default: always glide to the room's fit, so a pick always zooms
   to the room. Other option: as 2D, move only when the room is not wholly inside the visible box.
3. **Where Back goes.** Default: the camera from before the first focus, at the current angles. Other option: a fresh
   fit of the floor at the current angles (forgets a zoom made before the pick).
4. **A device from Search in 3D.** Default: as today, the camera does not move (the S31 non-goal). Other option: focus
   the device's room the same way.
5. **The default 3D picture.** Default: the exact box fit for every framing, the first draw too (the house sits a
   little larger or smaller than in 0.29; a turned plan is no longer cut at a corner). Other option: keep today's
   sphere for the first draw and Reset, use the box fit only for the visible box and rooms.
