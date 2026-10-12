# Hand align: move and turn a floor over the floor below

Status: implemented in 0.27.0 (Sprint 29), 2026-10-11, revised the same day (buttons, not dragging); the angle search
for 0.28.0 (Sprint 30) planned the same day, section "Sprint 30" below. Plan:
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

Planned 2026-10-11 (`docs/PLAN.md`, Sprint 30). The constants were fixed by the S30.1 design note on 2026-10-12, with
the probe numbers and a reason each (`docs/DECISIONS.md`).

### Why

0.27.0's Auto align keeps the floor's current turn and searches translation only. Diego's floors are turned against each
other by a few degrees, so it scores about 20 %. The fixture reproduces it: the first floor scores 19.7 % at turn 0 and
81.9 % at its true 4 degrees; the ground 25.3 % at 0 and 68.4 % at -2.5. It also shows the trap: the first floor scores
81.3 % at -176 and the ground 68.4 % at 177.5. A near-rectangular floor fits upside down as well as the right way.

### The API

- `alignShift(upper, lower, turn)`: 0.27.0's `alignFloor` under a new name, translation only at a given turn,
  `{ t, score, weak } | null`. Unchanged answers.
- `turnCandidates(upper, lower)`: the candidate turns, degrees.
- `refinePlace(samples, lines, place)`: the joint refinement (internal; exported for its test).
- `alignCandidates(upper, lower)`: every candidate turn searched and every fit refined; a list of fits
  `{ turn, t, score, res }`, merged (below) and sorted by turn, or null when either floor has no structure line. Reads
  the two floors' structure in their stored frames and nothing else: no pose, no current turn.
- `chooseAlign(fits, from = 0)`: picks one (below) and returns `{ turn, t, score, weak, alt } | null`.
- `alignFloor(upper, lower, from = 0)` = `chooseAlign(alignCandidates(upper, lower), from)`. Its third argument changes
  meaning: in 0.27.0 the search was held at that turn; now it is the floor's current turn, which the choice prefers.
  Junk reads as 0.

The result: `turn` in (-180, 180], to 0.01 degree; `t` to 0.1 cm; the place of the upper floor in the lower floor's
stored frame is `{ turn, shift: t }`, the turn about the upper floor's stored origin, as S29.7; `score` as before (0 to
100, the share of the upper floor's structure within `NEAR` of the lower's at that place); `weak` is `score < WEAK_BELOW`
(50, unchanged); `alt` is null or `{ turn, score }` of the best fit whose turn differs from the chosen one by more than
`SAME_TURN` (2 degrees) and whose score is at least the chosen one's minus `ALT_WITHIN`; it may score higher (a far fit
that missed `FAR_MARGIN`). When the answer is weak, an alt that is weak too is dropped: the alt must score at least
`WEAK_BELOW` itself. Nothing here throws, and an entry of `fits` that is not a fit (null, NaN) is ignored.

### The search

1. Structure lines of both floors in stored frames (`structure`, unchanged), in a canonical order: each line from its
   smaller end (x, then y), the list sorted by its four numbers.
2. Direction histograms: each line's direction modulo 90 degrees, weighted by its length in whole cm; lines shorter than
   20 cm do not count. Bins of 0.25 degree; a line's weight is split between its two nearest bins, in integers, so the
   sums do not depend on line order. Modulo 90 because a house's walls run in two directions at a right angle: one peak
   stands for both.
3. Circular cross-correlation of the two histograms, smoothed by a triangle of plus or minus 1 degree; its local maxima
   of at least half the highest, at least 2 degrees apart, at most 3, each sharpened by a parabola within half a bin.
   Each peak `θ` in (-45, 45] gives four candidates, `θ`, `θ + 90`, `θ + 180`, `θ - 90`; 0 is always a candidate. Each
   rounded to 0.01 degree, -180 read as 180, deduplicated, sorted. At most 13. A circle (a flat histogram) still gives
   at most 3 peaks.
4. Each candidate turn: the full translation search of `alignShift` on the upper floor's lines turned by it. No triage:
   any ranking cheaper than the full search can drop the true turn, and the full search is cheap with the exact line
   index (time budget, below). So the fits do not depend on `from`.
5. Every fit refined jointly (`refinePlace`): robust weighted least squares in shift x, shift y and turn, the turn scaled
   by the lever (the samples' weighted RMS radius about their centre) so all three are in cm; linearised about the
   placed samples' weighted centre, recomputed each round; the weights of `refine`, `w / (1 + (d / c)^2)^2` with `c`
   the per-axis median distance, at least 2 cm; the turn at most 2 degrees from where it started (it refines, it does
   not search); a step is kept when the score is no lower and the mean residual no larger; stop when every component of
   the step is under 0.05 cm (the turn as its move at the lever), or after 40 rounds.
6. Rounding: the turn to 0.01 degree, then the shift refit at that turn (turn held), starting from the shift that keeps
   the floor's centre where the refined place put it (the turn is about the stored origin, so on a floor far from
   [0, 0] a small rounding of the turn moves the floor far); the shift to 0.1 cm. Then every fit is scored on all
   samples at its rounded turn and shift.
7. Merge: fits within `SAME_TURN` (2 degrees) of each other are one answer. Inside it, the fits within `TIE` of its best
   score, then the smallest mean residual. Two candidates that refine to nearly the same turn would otherwise compete on
   a few tenths of a point.

### The choice (how a wrong half turn or quarter turn is avoided, and how ties break)

- The small tier: fits whose turn is within `SMALL_TURN` (10 degrees) of `from`. The far tier: the rest.
- The best of the small tier is the answer unless a far fit scores at least `FAR_MARGIN` (25) points more and is not
  weak. Why: Diego's floors are off by a few degrees; a half or quarter turn ties on any symmetric outline (the fixture
  shows 81.9 against 81.3), and a turn far from where the floor is drawn needs clear evidence. 25, not 15: a quarter
  turn of a small rectangle in a corner of a large one fits three sides against the true two and wins by up to 22.6
  points. A plan traced sideways is still found when the evidence is clear (the `align-house` L at 93 wins by 43.7);
  when it is not (a near-rectangle at 93, 21 to 24 points), the answer stays near `from` and `alt` names the far fit.
- Inside a tier, a tie (within `TIE`, 1 point, of the best) goes to the turn nearer `from`, then to the smaller move,
  then to the smaller mean residual, then to the smaller turn value. Every sort has a full key, so the answer never
  depends on the order the lines come in.
- `alt` is reported whatever the tiers: the best merged fit more than `SAME_TURN` away from the answer, scoring at least
  the answer's score minus `ALT_WITHIN` (5), by the same tie order. A symmetric floor therefore never gets a confident
  answer: it is `weak`, or it carries `alt` (a weak answer carries one only if the alt is not weak: for two unrelated floors both
  guesses are weak, and the panel says one weak match, not two). The words say "fits better" instead of "fits about as well" when `alt`
  scores more than `TIE` above the answer.
- With `from` the floor's current turn, a floor that was turned 180 degrees on purpose stays there; Auto align offers to
  turn it back only when that fits 25 points better. `from` 184 gives -176 (the result is in (-180, 180]).

### Determinism

The same two floors give the same result, deep equal, on every run. Another start vertex of the outline, the walls in
another order or reversed, the rooms shuffled: deep equal too, because the lines are put in canonical order first and
the histograms sum integers (the tests may allow 0.01 degree and 0.1 cm). No randomness; seeded only in tests.

### Weak evidence: never applied silently

- Only Apply writes Auto align's answer (and `alignToBelow`, which only a test calls). Opening the panel, a press, a key,
  a `hass` update, a reload: none writes.
- The panel's Auto align block, from `alignSummary` (`src/core/align-words.ts`):
  - `#alignScore`: "82 % match", or, when weak, "Weak match: 20 %. Check the plan before you apply it" (as today);
  - `#alignAlt`, only with `alt`: "A half turn (-176.0°) fits about as well (81 %). Check the plan before you apply
    it." ("A quarter turn" near plus or minus 90, else "A turn of 7.5°"; "fits better" when `alt` scores more than 1
    point above the answer);
  - `#alignMove`: the change from the current place: "Turn 4.0° clockwise, move the centre 34 cm right, 12 cm up". The
    move is the floor's pivot (`floorPivot`) in the floor below's frame; the turn the short way; no turn words under
    0.05 degree; "Already aligned" when nothing changes.
- Apply stays a button whatever the score, disabled only when nothing would change. It writes
  `poseFromPlace(layout, key, below, { turn, shift: t })` through `setPose`: one undo step; the status says "Aligned to
  Ground: 82 % match, turned 4.0°". The exact session pose starts again from the stored one, as after any writer.
- Hand align stays: Move, Turn, the boxes, Reset and Align stairs work before and after Apply, as in 0.27.0.

### The memo

The expensive part, `alignCandidates`, reads only the two floors' structure in stored frames, so the editor memoises it
on `alignKeyOf(upper)#alignKeyOf(lower)`, without the turn: a move, a turn, a box, Reset, Apply, undo and redo run no
search; a structure edit runs one. `chooseAlign(fits, from)` runs on every render and is cheap. This replaces S29.9's
key with the turn, which existed because the 0.27.0 search read the turn. `alignKey(f, turn)` keeps its argument for
`alignShift`.

### Time budget

Measured in vitest, the slower of two runs: each consecutive floor pair of `stress-layout.json`, as stored and with the
upper floor turned 7.3 degrees about its centre, under 600 ms; the stress first floor with 300 short external walls on
it and on the ground (the heavy floor of `align-mode.spec.ts`), under 600 ms; the 10 000-point circle under 8000 ms (as
today). In the Studio, opening Align on the heavy floor shows the score within 1500 ms.

How it fits (S30.1, 2026-10-12): an exact line index on the lower floor's lines. A bucket grid, cells at least
2 · `REFINE_REACH` (50 cm) wide and at most 1024 a side; each cell lists every line that can be within `REFINE_REACH`
of a point in it, in the lines' own order. A distance query reads one cell's list instead of every line, and every
answer is bit for bit the same as the scan. Probe on an Apple M5: the heavy floor's full search 32 ms with the index,
311 ms without; forced to 13 candidates, 212 against 2413 ms. Split for the slowest case: candidates under 5 ms,
searches under 400, refinement under 100, scoring and merging under 50.

### Non-goals (0.28.0)

A preview of the proposal before Apply (Apply then Undo); stairs, rooms or devices as evidence (stairs are drawn
differently on Diego's floors; Align stairs stays a button); scale; a worker thread; any card change.

## Acceptance criteria (0.28.0)

13. On `hand-align-house.json` with no pose, `alignFloor` from turn 0 puts every outline corner of the ground and of the
    first floor within 2 cm of where the truth puts it, the turn within 0.2 degree, `weak` false, and `alt` naming the
    half turn.
14. Turned by each of -9.70, -6.20, -3.30, -1.10, -0.35, 0.40, 1.80, 4.00, 7.30 and 9.95 degrees about `[370, -120]`, the
    `align-house` first floor and both hand-align floors align within 0.2 degree and 2 cm at every outline corner; the L
    turned 23.00, -31.00 and 93.00 degrees on a copy of itself is found too (the `align-house` rectangle at 93 has a
    half-turn twin that fits as well: either, with `alt` naming the other).
15. A symmetric square house never gets a confident answer (`weak` false with `alt` null); two unrelated random star
    polygons are weak or carry `alt`, for 20 seeds (random orthogonal houses share real corners and may fit); a noisy copy (4 cm jitter, 15 stray lines) aligns within 0.5 degree and 5 cm.
16. `from` is honoured: the first floor with `from` 184 stays at 184 (returned as -176); with 0 it goes to 4.
17. No lines on either floor: null and "Nothing to match"; junk floors and junk `from` never throw.
18. The result is deep equal on a second run, and with the lines in another order.
19. Every 0.27.0 `alignFloor` test still passes with turn 0, and `alignShift` gives 0.27.0's answers.
20. The time budget above holds.
21. In the Studio, with real clicks: the panel says the turn and the other turn, Apply writes turn and offset in one undo
    step, Undo restores, hand align works after it, and a turn press runs no search.
22. Weak and alt evidence is said and never applied without Apply; Lock plan refuses Apply.
23. The panel's new lines are their own top element at 1024 x 768 and 380 x 800 with the toolbar wrapped.
24. Exit: Auto align then Apply on the ground and the first floor of the hand-align house, Save, and in the card with
    `floors_below: solid` the stairs of each floor lie within 2 cm of the one below's.

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
