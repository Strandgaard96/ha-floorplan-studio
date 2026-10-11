# Hand align: move and turn a floor over the floor below

Status: implemented in 0.27.0 (Sprint 29), 2026-10-11, revised the same day (buttons, not dragging). Plan:
`docs/PLAN.md`, Sprint 29 (0.27.0) and Sprint 30 (0.28.0).

## Why

Diego, 2026-10-11: the stairs of his three floors (basement up, ground both, first down) do not line up in 3D. The
Studio can show the floor below as a ghost, type an offset, and run Align to floor below, which scores 20 to 24 % on
his house because his floors differ. The misalignment is a rotation plus an offset. So a floor needs a turn as well as
an offset, every view that shows two floors together must use both, and the Studio needs a plain way to move and turn
a floor in small known steps. Diego chose buttons in the Align panel over dragging on the plan.

## Goal

On a floor that has a floor below, Diego can lay it over the floor below with the Align panel's buttons and keys, in
steps he picks, or with one press of Align stairs. The stairs of adjacent floors then line up in the card's ghost and
in 3D within 2 cm and 0.2 degrees.

## Non-goals

- Dragging or turning the floor with the mouse on the plan, a turn handle, snapping to the ghost, picking point pairs
  on the plan. Dropped by Diego, 2026-10-11.
- Scale. A floor drawn at the wrong scale is fixed with the trace Scale tool.
- Turning a floor's own view. A floor shown alone, in the card or the Studio, is drawn in its own stored frame, as
  today. The house may seem to turn by a few degrees when you switch floors; it does today too.
- Aligning to any floor but the one below. Turning the lowest floor from the UI (the schema allows it).
- Automatic rotation search: Sprint 30 (0.28.0). In 0.27.0 Align to floor below keeps the floor's current turn and
  searches translation only.
- Editing walls or rooms while Align is open.
- The card: nothing to set there. It reads the pose.

## The pose (the schema decision)

- `floor.rotation?: number`, degrees, clockwise on screen (plan y points down), the same sense as `rot` on a piece of
  furniture. Beside `floor.offset`. Absent means 0.
- A stored point `p` of a floor sits in the house at `R(rotation) · p + offset`: the turn about the floor's stored
  origin `[0, 0]`, then the offset. With rotation 0 this is exactly the S27 rule, so every layout made since 0.25.0
  means the same.
- Why the origin and not the floor's centre: a pivot that depends on geometry would move the whole floor in the house
  each time a room is added. The origin never moves. The panel turns about the floor's centre by writing rotation and
  offset together (below).
- `validate` reports a rotation that is not a finite number, or one outside -180 to 180 inclusive, and never throws.
  `migrate` drops such a value, as it drops a bad offset, so a hand-edited file still opens.
- Stored precision: rotation to 0.01 degree, offset to 0.1 cm. Writers normalise the rotation to (-180, 180] and delete
  each key at 0. Offsets were whole cm in S27; 0.1 cm is needed so a turn of 0.1 degree about the centre does not
  move the centre by up to half a centimetre. `validate` already accepts any finite offset, so nothing old breaks.
- Schema stays v2: the field is additive and optional. A card of 0.26 or older ignores it and draws the ghost and
  floors below unturned; that is accepted.
- `addFloor` gives the new floor the lowest floor's rotation as well as its offset (it copies that floor's outline).
- Lock plan refuses a rotation change, as it refuses an offset change.

### One helper for every view

`floorPlace(layout, from, to)` in `src/core/floor-stack.ts` returns `{ turn, shift }`: what to do to a stored point of
floor `from` to draw it in the stored frame of floor `to`: `p' = R(turn) · p + shift`, with `turn = rot_from - rot_to`
and `shift = R(-rot_to) · (offset_from - offset_to)`. Junk on either floor reads as identity. With both rotations 0 it
gives `turn` 0 and the S27 `floorShift`. `floorShift` is removed once its three call sites have moved.

Pure helpers beside it: `floorPose(layout, key)` (`{ rot, off }`, junk read as identity), `placePoint(place, p)`,
`invertPlace`, `composePlace`, `poseFromPlace(layout, key, below, place)`, and `floorPivot(floor)`: the centre of the
bounding box of the floor's structure lines (outline and external walls, else room edges: the lines Align reads), else
of its stairs, else `[0, 0]`. The pivot is in the floor's own frame, so it does not change when the pose changes, and
Align mode does not edit geometry, so it holds still for the whole session.

### Who reads it

| View | Today | With rotation |
|---|---|---|
| A floor's own plan, card and Studio (2D, 2.5D, 3D) | own frame | own frame, unchanged; no hit test changes |
| Ghost floor (card 2D and 2.5D, Studio) | `shift` per point | `floorPlace` per point, flat at floor level in 2.5D |
| 3D floors below | `SceneOpts.shift` | `SceneOpts.turn` then `shift` on every solid: slabs, holes, walls, stairs, furniture, devices; crowns and contact shadows follow |
| Floor switch animation | own frame | unchanged |
| Align's own search | stored frames | the upper floor's lines placed by the current turn, then searched (translation only until Sprint 30) |
| Export, Save | the field | the field |

Nothing that can be clicked is ever transformed: the ghost has no hit targets, floors below are never picked. So
picking on a turned floor is what it is today, in the card and the Studio. Nothing on a floor below has a label or an
upright icon to keep.

## The Align panel, 0.27.0

Opened as today (Floors, Align to floor below…) on a floor that has a floor below. The ghost is drawn whatever View,
Floor below says, and goes back to that setting on close. Opening clears the selection and stops a drawing. The
overlay draws no edit handles while Align is open, only a small cross at the pivot (`pointer-events:none` by class
rule).

### What moves on screen

The Studio keeps the current floor in its own frame, as everywhere else. So when you press Move right, this floor
stays where it is on screen and the ghost of the floor below moves left: relative to each other, this floor moved
right. The panel says so in one line under the buttons: "This floor moves. The floor below (faint lines) is drawn
moving the other way." Every button names this floor ("Move this floor right", "Turn this floor clockwise").

### Controls, top to bottom

1. The floor below by name.
2. Auto align: score, the move in words, Apply (as S27, now keeping the turn).
3. **Move**: four buttons in a cross, up, left, right, down, as drawn on screen. With the view turned, "up" is still up
   on screen: the move in the floor's own frame is the screen direction turned back by the view turn, and the offset
   changes by that move turned by the floor's rotation.
4. **Step**: a segmented control, 1 cm, 5 cm, 50 cm. Default 5 cm.
5. **Turn**: two buttons, anticlockwise and clockwise, about the floor's pivot. The pivot's place in the house does not
   change (below).
6. **Angle step**: a segmented control, 0.1, 0.5, 1, 3 degrees. Default 0.5.
7. **Readout and boxes**: Offset x and y (cm, 0.1) and Rotation (degrees, 0.01), each a box that also takes a typed
   value (one undo step per change; junk changes nothing and shows the value again). The Rotation box turns the floor
   about the same pivot as the Turn buttons, so the pivot's place in the house does not change and the offset follows. A
   typed value that would pass the coordinate limit says so in the status line and writes nothing. Reset sets rotation
   and offset to 0 in one step.
8. **Stairs**: the stair report and Align stairs.

The plan is read-only while Align is open on its floor (review 29). A press only pans and the wheel zooms; nothing is
selected, dragged or deleted; Delete, Backspace, Ctrl+A, double click and the right-click menu do nothing; starting a
draw closes Align. The Outline is no way round it: its row menu and the Menu key open nothing, and a click on a row of
this floor centres on the thing but selects nothing (opening Align already cleared the selection). A row of another
floor switches floor, which closes Align as any floor change does.

The two step choices are remembered per viewer in `localStorage` (`fp-align-steps`), every access in try/catch; junk or
blocked storage gives the defaults. Not in the layout, not an undo step.

All controls are real buttons with `aria-label`s, a 44 px touch target on a coarse pointer, and `aria-pressed` on the
selected step. The panel lives in the Inspector, so it never sits under a toolbar menu; it scrolls inside the aside on
a short window and works at 1024 and 380 px wide with the toolbar wrapped. No control depends on a menu being closed
(the CI finding of 2026-10-10).

### Keys

Heard on the editor host, never on `window`, only while Align is open, never while a text field has focus.

| Key | Does |
|---|---|
| Arrow keys | Move by the selected step, as the buttons. Elsewhere they still pan the view. |
| `,` and `.` | Turn anticlockwise and clockwise by the selected angle step. |
| Escape | Closes Align (as today). |

Why `,` and `.` and not `[` `]`: on Diego's Italian keyboard the brackets need AltGr or Option; the comma and full stop
are on every layout without a modifier.

### One press, one undo step; no repeat

A button press or a key press is one undo step. Holding a button does nothing more; a key's auto-repeat events
(`ev.repeat`) are ignored. Why: the steps go up to 50 cm and 3 degrees, so a hold buys little; ignoring repeat keeps one
step per press with no draft pose, no timer and no keyup bookkeeping (finding 6), and a held key cannot fill the
100-step history in three seconds.

### No drift: the session pose

Each press rounds what it stores, and rounding many small steps would add up: a 1 cm move on a floor turned 4 degrees
stores (1.0, 0.1) for (0.998, 0.070), and a turn about the centre moves the stored centre by up to 0.05 cm. So
`EditorState` keeps an exact pose for the floor being aligned: unrounded rotation and offset. A press applies to the
exact pose, and the stored pose is the exact one rounded. The exact pose is trusted only while its rounding equals the
stored pose; after anything else writes the pose (a box, Reset, Apply, Align stairs, undo, redo, a load) the two
differ and the exact pose starts again from the stored one. A turn by `d` about pivot `c`: `rot' = rot + d`,
`off' = off + R(rot) · c - R(rot') · c`, so the pivot's house point `R(rot) · c + off` is unchanged exactly. Then
`rotation = round(normalise(rot'), 0.01)`, `offset = round(off', 0.1)`.

Property: 3600 presses of 0.1 degree one way return the stored rotation to its start within 0.01 and the stored offset
within 0.1 cm, and so do 3600 the other way and any mix of steps; at every press the pivot's house point from the
stored pose is within 0.1 cm of where it started, also with the pivot far from the origin.

### Stair report and Align stairs

The panel lists each stair of this floor (by name) with the nearest stair of the floor below, by centre distance in the
frame of the floor below: "Stairs: 12 cm from Ground stairs, 3.5° off". The centre is the middle of the stair's
bounding box (the point `stairBlocks` turns it about). The angle is between the flights' axes, modulo 180 degrees; a
round stair has no axis and shows the distance only. It updates on every press. None on either floor: "No stairs on
this floor" or "No stairs on Ground".

Align stairs (enabled when both floors have a stair with a footprint) uses the first stair of this floor and the stair of the floor below nearest to it by centre distance (the stair report's rule, review 29). A straight
flight gives two points: the middles of its low edge and of its top edge. The floor moves so the low points meet and
turns about them so the flights lie on one line; of the two ways to match (same order, or reversed for a flight drawn
the other way) the one with the smaller turn wins. A round stair gives its centre: move only, and the status says
"round stairs: moved, not turned". One undo step. The status says what it did: "Aligned Stairs to Ground stairs: moved
34 cm, turned 2.1°".

Stair centres are a guide: two flights that turn at a landing, or a stair drawn bigger on one floor, have different
centres when the floors are right. Hence a button, not something automatic.

### Hostile and edge cases

- No floor below: Align is disabled with its reason, as today; the floor below going away while Align is open closes it.
- A press that would put the offset beyond `COORD_LIMIT`: nothing is written; the status says so.
- A floor with no geometry: the pivot is the origin; moves work; Align stairs is disabled.
- A pose with junk in the file: `migrate` dropped it; the panel shows 0.
- Lock plan: every button and key is refused with the Unlock offer; nothing moves.
- A `hass` update between presses changes nothing in the panel or the exact pose.
- The memoised Align search does not run on a press: its key holds the relative turn, so a move does not search and a
  turn searches once (it reads the turn).
- `prefers-reduced-motion`: nothing here animates.

## Sprint 30 (0.28.0): Align searches angles

`alignFloor` searches rotation too: candidate angles from the direction histograms of the two floors' structure lines
(each pair of dominant directions, modulo 90 degrees), small angles first (-10 to 10), then the rest; for each, the
existing translation search on the turned samples; the best few refined by a joint turn and translation least squares
(small-angle linearised, the same robust weights). It reports `turn`, `t` and the score; the panel says the angle.
Budget: the stress layout's floors in under 600 ms. Planned in full once 0.27.0 has shipped.

## Acceptance criteria (0.27.0)

1. A layout with no `rotation` renders byte for byte as before in the card and the Studio (render snapshot, 3D scene
   unit snapshot).
2. `validate` reports and `migrate` drops `NaN`, `"3"`, `null`, `181`, `-180.5`, `Infinity`, `[4]`, on a floor named
   `__proto__` too; `0`, `-180`, `180`, `3.25` are kept.
3. `floorPlace` round trip: for three floors with asymmetric poses, a point from A to B and back is within 1e-9; A to C
   equals A to B composed with B to C; both rotations 0 gives the S27 `floorShift`.
4. A turned floor below draws its ghost so that a known corner lands on the computed pixel, within 1 px, in the card
   and the Studio, at a view turn of 0 and 90 degrees; the card's and the Studio's ghost paths are equal.
5. In 3D, a turned floor below puts a slab corner, a wall end, a stair corner and a tree crown where `floorPlace` says,
   within 1 cm through the test hook; a tap on it picks nothing; changing only the rotation rebuilds it.
6. Real-mouse clicks on each of the six buttons at their real coordinates change the pose by the selected step, in
   the right direction, one undo step each, at view turn 0 and 90; the ghost corner's pixel moves the opposite way.
7. The step controls change the size of the next press; the choice survives a reload; blocked storage gives defaults.
8. Keys: each arrow and `,` `.` press is one step; `keyboard.down` with auto-repeat then `up` is one step; keys in a
   text box do nothing to the floor; outside Align the arrows pan.
9. The drift property of the session pose holds (3600 presses each way, mixed steps, a far pivot).
10. Align stairs on `hand-align-house.json` gives the true place within 2 cm and 0.2 degrees and says what it did; the
    report's numbers match within 1 cm and 0.1 degree.
11. At 1024 x 768 and 380 x 800, every panel control is its own top element at its centre; reduced motion leaves no
    running animation.
12. Exit: in the Studio, Align stairs on the ground and the first floor, Save; in the card with `floors_below: solid`,
    each floor's stair footprint corners lie within 2 cm of the one below's.

## Risks

- **The ghost moves, not the floor.** Pressing Move right sends the faint lines left. The panel's line and the button
  labels say which floor moves; Diego accepted this view model on 2026-10-11. If it reads wrong in use, a later
  release can hold the ghost still by answering each pose change with the view (noted, not planned).
- **3D builders that read `ref` and not the solid's points** (crowns, contact shadows) would miss the turn. Criterion 5
  probes a crown on a turned floor below.
- **The 3D view's below cache keys on numbers.** `_sync3dBelow` compares elevation and shift; it must include the turn,
  or a rotation edit never reaches the view. Criterion 5's last clause.
- **Pivot at the origin far from the floor.** Large offsets for small turns; well within `COORD_LIMIT`. The session pose
  keeps rounding from adding up (criterion 9).
