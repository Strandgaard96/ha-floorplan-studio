# Hand align: move and turn a floor over the floor below

Status: proposed, 2026-10-11. Waiting for Diego's yes. Plan: `docs/PLAN.md`, Sprint 29 (0.27.0) and Sprint 30 (0.28.0).

## Why

Diego, 2026-10-11: the stairs of his three floors (basement up, ground both, first down) do not line up in 3D. The
Studio can show the floor below as a ghost, type an offset, and run Align to floor below, which scores 20 to 24 % on
his house because his floors differ. There is no way to grab a floor and slide it. Later the same day: the misalignment
is not a translation, it is a rotation plus an offset. So a floor needs a turn as well as an offset, every view that
shows two floors together must use both, and the hand tools must move and turn.

## Goal

On a floor that has a floor below, Diego can lay it over the floor below by hand in under a minute: drag it, turn it,
nudge it with keys, or click two matching points (or two pairs), or press Align stairs. The stairs of adjacent floors
then line up in the card's ghost and in 3D within 2 cm and 0.2 degrees.

## Non-goals

- Scale. A floor drawn at the wrong scale is fixed with the trace Scale tool, not here.
- Turning a floor's own view. A floor shown alone, in the card or the Studio, is drawn in its own stored frame, as
  today (see the pose, below). The house may seem to turn by a few degrees when you switch floors; it does today too.
- Aligning to any floor but the one below. Turning the lowest floor (the schema allows it; no UI writes it).
- Automatic rotation search. Align to floor below keeps a floor's current turn and searches translation only in 0.27.0;
  the search over angles is Sprint 30 (0.28.0).
- Editing walls or rooms while Align is open. Align is a mode of the whole floor.
- The card: nothing to set there. It reads the pose.

## The pose (the schema decision, made now for both releases)

- `floor.rotation?: number`, degrees, clockwise on screen (plan y points down), the same sense as `rot` on a piece of
  furniture. Beside `floor.offset`. Absent means 0.
- A stored point `p` of a floor sits in the house at `R(rotation) · p + offset`, the turn about the floor's stored
  origin `[0, 0]`, then the offset. With rotation 0 this is exactly the S27 rule, so every layout made since 0.25.0
  means the same.
- Why the origin and not the floor's centre: a pivot that depends on geometry moves the whole floor in the house each
  time a room is added. The origin never moves. The hand tools keep their own pivot (the centre of the floor's
  structure, below) and write rotation and offset together so that pivot holds still; that is what keeps a drag and a
  turn from fighting.
- `validate`: two things are reported, never thrown: a rotation that is not a finite number, and one outside
  -180 to 180 inclusive. `migrate` drops such a value, as it drops a bad offset, so a hand-edited file still opens.
  Writers normalise to (-180, 180], round to 0.01 degree, and delete the key at 0. Why 0.01 and not 0.1: 0.1 degree is
  3.5 cm at 20 m; 0.01 is 0.35 cm. Offsets stay whole cm. A writer rounds the rotation first and then computes the
  offset from it, so the gesture's pivot lands within half a centimetre of where it was put.
- Schema stays v2. The field is additive and optional. A card of 0.26 or older ignores it and draws ghost and floors
  below unturned; that is accepted.
- `addFloor` gives the new floor the lowest floor's rotation as well as its offset (it copies that floor's outline).
- Lock plan refuses a rotation change, as it refuses an offset change.

### One helper for every view

`floorPlace(layout, from, to)` in `src/core/floor-stack.ts` returns `{ turn, shift }`: what to do to a stored point of
floor `from` to draw it in the stored frame of floor `to`: `p' = R(turn) · p + shift`, with `turn = rot_from - rot_to`
and `shift = R(-rot_to) · (offset_from - offset_to)`. Junk on either floor reads as identity. With both rotations 0 it
gives `turn` 0 and the S27 `floorShift`. `floorShift` is removed; its three call sites move to `floorPlace`.

Pure helpers beside it: `floorPose(layout, key)` (`{ rot, off }`, junk read as identity), `placePoint(place, p)`,
`invertPlace`, `composePlace`, and `poseFromPlace(layout, key, below, place)`: the pose of floor `key` that puts it at
`place` relative to `below` (`rot = rot_below + turn`, `off = R(rot_below) · shift + off_below`), rounded as above.

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
picking on a turned floor is what it is today, in the card and the Studio. Devices on floors below keep their
positions turned with the floor; nothing on a floor below has a label or an upright icon to keep.

## The Align mode, 0.27.0

Opened as today (Floors, Align to floor below…) on a floor that has a floor below. The ghost is drawn whatever View,
Floor below says, and goes back to that setting on close. Opening clears the selection and stops a drawing. The
overlay draws no edit handles while it is open: only the pivot mark, the turn handle, picked points and snap marks.

### The frame while Align is open

The ghost holds still and the floor moves under the hand. When Align opens, the Studio records the floor's place over
the floor below; while it is open, any change of pose (drag, turn, keys, pairs, stairs, Apply, the number boxes, undo,
redo) is answered by a change of the view the other way, folded into the view's own turn and pan, so the ghost stays
on the same pixels and the floor moves. This is the same path the view turn already takes (`turnG`, `toSvg`), so
`renderFloor`'s upright labels and every pointer mapping follow without a second draw path. On close the view drops
the extra turn and pan, keeps the zoom, and centres on the same point of the floor.

### Gestures

| Input | Does |
|---|---|
| Press and drag on the plan (mouse, pen, one finger) | Moves the floor. Live readout beside the pointer and in the panel: "34 cm right, 12 cm up". |
| Press and drag the turn handle | Turns the floor about the pivot. Readout "2.4°". |
| Click (press and release under 4 px) | Picks a point; see Point pairs. |
| Middle, right, Ctrl or Cmd drag; wheel; pinch | Pan and zoom, as today. |
| Arrow keys | Move 1 cm; Shift 10 cm. Arrows pan the view everywhere else; in Align mode they move the floor. |
| `[` and `]` | Turn 0.1 degree anticlockwise and clockwise; Shift 1 degree. |
| Alt held | No snap for this gesture (the status bar already says "Snap off"). |
| Escape | Cancels the gesture in progress, else drops picked points, else closes Align. |

Pivot: the centre of the bounding box of the floor's structure lines (the outline and external walls, else the rooms:
the lines Align already reads), in the floor's own frame. A floor with no geometry has no pivot: the turn handle is
not drawn, `[` `]` and the rotation box turn about the origin. The turn handle sits 40 px beyond the structure's top
edge above the pivot, a 44 px touch target, drawn by the overlay.

Snap, on by default, within 14 px on screen (the editor's own threshold):
- Move: a corner of this floor (structure corners and stair corners) onto a ghost corner first; else a corner onto a
  ghost structure line (along the line's normal); else whole cm. The nearest pair wins. A ring marks the snap target.
- Turn: Shift gives steps of 15 degrees of the turn relative to the floor below. Without Shift, the turn snaps to make
  one of this floor's 8 longest structure lines parallel to one of the ghost's 8 longest when within 1 degree; else
  0.01 degree.
- Point picks: corners and stair corners and ends of the floor being picked on (this floor, then the ghost).
- The editor's `snapCorner` is not reused: it snaps one point inside one floor and excludes that point's own group.
  What is reused is `align.ts`'s structure lines and corner ranking (exported for this), `geometry.ts`'s projection,
  and the 14 px threshold.

Undo: one undo step per gesture. A drag, a turn, a held arrow or bracket (press to release, auto repeats included) is
one gesture, shown live from a draft pose that is not in the layout, and written once with `setPose` at its end. A
gesture that ends where it started writes nothing. Each separate key press is a step. Why a held key is one step: a
held arrow repeats about 30 times a second and would fill the 100-step history in three seconds; press to release is
the same gesture rule a drag follows (finding 6). A held key ends on its keyup, on blur, on any other key and on any
pointer press. Keys are heard on the editor host, never on `window`, and never while a text field has focus.

Hostile and edge cases:
- No floor below: Align is disabled with its reason, as today. Closing a floor's floor below (deleting it, moving
  floors) while Align is open closes Align, as today.
- A pose that would put the offset beyond `COORD_LIMIT`: nothing is written; the status says so (as Apply does).
- A second pointer during a drag or turn cancels it, as Escape does (a pinch starts as one finger).
- A drag cannot start on an edit handle: none is drawn. The turn handle is the only handle.
- The memoised Align search holds its last answer during a drag, a turn and a held key, and runs once at the end if its
  key changed (the key now includes the relative turn).
- `prefers-reduced-motion`: nothing here animates. Snap marks appear and go, no transition.
- `hass` updates mid-gesture do not end it and do not reset the draft.
- Lock plan: the gesture is refused at its start with the Unlock offer; no draft is drawn.

### Point pairs

A click on the plan in Align mode picks a point. Clicks alternate: a point of this floor (snaps to its corners and
stair points), then the matching point of the floor below (snaps to the ghost's). The first point is drawn as a
numbered dot and the panel says what to click next.

- Pair 1 done: the floor moves so the two points meet. One undo step.
- Pair 2 done: the floor turns about pair 1's point so the line from pair 1 to this floor's second point lies on the
  line to the floor below's second point. One undo step. The panel says the turn and the length mismatch of the two
  lines ("turned 3.6°; the two lines differ by 4 cm"); over 10 cm it adds "check the points".
- A pair whose two points are the same spot, or a second pair under 50 cm from the first, does nothing and says why.
- Escape drops the pending point; a drag or turn drops the pairs.

Pin and swing is exact for two pairs and is what a person does with paper plans. A least-squares fit of more pairs is
not needed for two.

### Stair report and Align stairs

The panel lists each stair of this floor (by name) with the nearest stair of the floor below, by centre distance in the
frame of the floor below: "Stairs: 12 cm from Ground stairs, 3.5° off". The centre is the middle of the stair's
bounding box (the point `stairBlocks` turns it about). The angle is between the flights' axes, modulo 180 degrees; a
round stair has no axis and shows the distance only. It updates live during a gesture. None on either floor: "No stairs
on this floor" or "No stairs on Ground".

Align stairs (enabled when both floors have a stair with a footprint) uses the first stair of each floor. A straight
flight gives two pairs: the middles of its low edge and of its top edge. Of the two ways to match them (same order, or
reversed for a flight drawn the other way) the one with the smaller turn wins. A round stair gives one pair, its
centre: move only, and the status says "round stairs: moved, not turned". One undo step. The status says what it did:
"Aligned Stairs to Ground stairs: moved 34 cm, turned 2.1°".

### The panel

Top to bottom: the floor below by name; the auto result (score, move) and Apply; Rotation (degrees) as a number box,
with the Offset x and y boxes and Reset (now resets rotation and offset); the live readout; Align stairs and the stair
report; the pair hint. Each box is one undo step per change; junk changes nothing and shows the value again. It lives
in the Inspector, so it never sits under a toolbar menu; it scrolls inside the aside on a short window and works at
1024 and 380 px wide. No control depends on a menu being closed (the CI finding of 2026-10-10).

## Sprint 30 (0.28.0): Align searches angles

`alignFloor` searches rotation too. Candidate angles from the direction histograms of the two floors' structure lines
(each pair of dominant directions, modulo 90 degrees), small angles first (-10 to 10), then the rest; for each, the
existing translation search on the turned samples; the best few refined by a joint turn and translation least squares
(small-angle linearised, the same robust weights). It reports `turn`, `t` and the score; the panel says the angle.
Budget: the stress layout's floors in under 600 ms, measured. Detailed in its own plan section once 0.27.0 has shipped.

## Acceptance criteria (0.27.0)

1. A layout with no `rotation` anywhere renders byte for byte as before in the card and the Studio (render snapshot,
   3D scene unit snapshot).
2. `validate` reports and `migrate` drops `NaN`, `"3"`, `null`, `181`, `-180.5`, `Infinity`, on a floor named
   `__proto__` too; `0`, `-180`, `180`, `3.25` are kept.
3. `floorPlace` round trip: for three floors with asymmetric poses, placing a point from A to B and back gives the
   point within 1e-9; A to C equals A to B composed with B to C.
4. A turned floor below draws its ghost so that a known corner lands on the computed pixel, within 1 px, at real
   coordinates, in the card and the Studio, at a view turn of 0 and 90 degrees. The card's and the Studio's ghost paths
   are equal.
5. In 3D, a turned floor below puts a known corner where `floorPlace` says, within 1 cm through the test hook, for its
   slab, a wall, a stair and a tree crown; a tap on it picks nothing; changing only the rotation rebuilds it.
6. In the Studio, a real-mouse drag of 200 px moves the offset by 200 px in cm, one undo step, the ghost stays on its
   pixels within 1 px; Escape mid-drag writes nothing; a click that does not move picks a point.
7. A real drag of the turn handle by a quarter circle with Shift gives 90 degrees, one step; without Shift near
   parallel it snaps parallel.
8. Arrow and bracket keys: one press one step of the right size; a held key with auto repeat one step; keys in a text
   box do nothing to the floor.
9. Two pairs by real clicks on `hand-align-house.json` put the first floor within 2 cm and 0.2 degrees of its true pose.
10. Align stairs on the same fixture gives the same within 2 cm and 0.2 degrees, and says what it did.
11. The stair report reads the distance and angle within 1 cm and 0.1 degree of the computed ones and updates during
    a drag.
12. Exit: in the Studio, Align stairs on the first floor and on the ground floor, Save; in the card with
    `floors_below: solid`, the first floor's stair footprint corners lie within 2 cm of the ground's, and the ground's
    over the basement's.

## Risks

- **Two frames on one screen.** The Align frame turns the view by the floor's pose change. A mistake shows as the
  ghost creeping during a drag. The pixel test in criterion 6 pins it, at a view turn of 0 and 90.
- **Stair centres are a guide, not the truth.** Two flights that turn at a landing, or a stair drawn bigger on one
  floor, have different centres when the floors are right. The report says "nearest", and Align stairs is a button,
  not automatic.
- **Pivot at the origin far from the floor.** A layout whose points sit far from 0 gets large offsets for small
  turns. Offsets stay well within `COORD_LIMIT`; rounding is bounded as above. Documented in SPEC.
- **3D builders that read `ref` and not the solid's points** (crowns, contact shadows) miss the turn. Criterion 5
  probes a crown and the shadow mesh on a turned floor below.
- **The 3D view's below cache keys on numbers.** `_sync3dBelow` compares elevation and shift; it must include the
  turn, or a rotation edit never reaches the view. Criterion 5's last clause.
- **Size.** 0.27.0 is about Sprint 27's size (18 tasks). The angle search is held to 0.28.0 so 0.27.0 ships the hand
  tools that fix Diego's house.
