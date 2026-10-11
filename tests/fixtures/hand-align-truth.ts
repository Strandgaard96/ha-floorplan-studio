// S29.2: the true places of the floors in `hand-align-house.json`. Invented numbers; the file is a demo-style house, not a real one.
// A place is `p' = R(turn) · p + shift` with `turn` in degrees, clockwise on screen (y points down): what to do to a stored
// point of the first floor named to draw it in the stored frame of the second. Every floor in the fixture is stored with no
// `rotation` and no `offset`, so these are what hand align (or Align stairs) has to find.
export interface TruePlace { turn: number; shift: [number, number] }

/** The ground, drawn turned -2.50 degrees and shifted [-57, 112] from the basement. */
export const GROUND_TO_BASEMENT: TruePlace = { turn: -2.5, shift: [-57, 112] };
/** The first floor, drawn turned 4.00 degrees and shifted [83, -41] from the ground. */
export const FIRST_TO_GROUND: TruePlace = { turn: 4, shift: [83, -41] };
