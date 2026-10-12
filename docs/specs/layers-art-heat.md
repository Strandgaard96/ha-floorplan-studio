# Layers in 3D, cover art, temperature colours

Status: spec, 2026-10-12 (Sprint 29), revised after review (Fable), heatmap
simplified to temperature pills (Diego). Not built.

## Goal

Three things on the plan a phone user reads at a glance: which families of
devices are shown (now in 3D too), what each speaker is playing, and how warm
each room is.

## Decided (Diego, 2026-10-12)

1. **Layers in 3D, devices only.** The Layers button and chips show in live
   3D. Device families hide there as they do in 2D. Furniture is not hidden in
   3D (its solids are in the canvas; rebuilding the scene is out of scope).
2. **Cover art on the plan** (option A of three: on the plan, not in the room
   panel). A playing speaker shows its cover art in place of its icon.
3. **The art is switched in the View options menu** ("Cover art"), remembered
   per viewer, with a YAML default.
4. **Defaults accepted:** every speaker of a group shows the art; art only
   while `playing`; in 2D and 3D.
5. **A fixed comfort scale** (option A of three: fixed, not relative to the
   house, not relative to a thermostat target). Blue at `heat_min`, neutral at
   the midpoint, red at `heat_max`.
6. **Temperature colours, not a room heatmap** (Diego, after review: simpler).
   The temperature reading is drawn on a coloured **pill**; a temperature
   icon gets a ring in that colour. No room fill, no legend. **Default on**,
   switched in View options ("Temperature colours"), remembered per viewer.
7. **Dropped:** the Security lens. Not in this sprint.

## Assumptions (change any of them)

### Layers in 3D

- L1. Today nothing in the 3D path applies `layerHides`: `liveOf`
  (`src/core/live-build.ts`) builds every device and the card's `setLive` call
  passes no `hiddenLayers` or `keep`. New: `liveOf` takes `hiddenLayers` and
  `keep` in its options and returns `null` for a hidden device (the slot a
  room sensor already uses). The card passes `hiddenLayers` and `_keptHere()`
  to `setLive`, as it does to `renderFloor`.
- L2. What a hidden family loses in 3D: the overlay icon, the ball, the lamp
  body, and a lamp's pool and wall glow. The room lift stays, as the 2D room
  glow stays for hidden lights. `applyLive` skips balls, bodies and pools for
  `null` slots.
- L3. `keep` in the card is a device located by search or by a row tap (the
  card never passes an editor selection). Such a device stays visible with its
  family hidden.
- L4. `_layersToggle` and `_layerChips` stop returning `nothing` under
  `_shows3d()`. The Furniture chip is `disabled` in 3D with the title
  "Furniture hides in 2D only"; its stored state is kept and applies again in
  2D. Chips sit in the Overview, so under `kiosk` or `active_list: false`
  there are none, in 2D as today.

### Cover art

- A1. Applies to devices of type `speaker` and `media`. The entity's domain
  is not checked (`classOf` does not check it either). Not to `tv` and not to
  unlinked speaker objects (3D draws those without live state today;
  DECISIONS 2026-10-06, "a speaker or TV object stands in for its media
  player").
- A2. A pure `artUrl(attributes): string | null` in core, beside
  `TRACE_SRC` in `src/core/schema.ts` (the precedent for a strict href
  pattern). It reads `entity_picture_local`, then `entity_picture`; a value is
  accepted only if it is a string of at most 2048 characters that starts with
  `/`, whose second character is not `/` or `\`, and that matches
  `^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?\-]*$`. Everything else is `null`.
  Reasons: Music Assistant's `entity_picture` is a LAN address
  (`http://<host>:8095/imageproxy/...`) that fails over a remote connection
  and would break "no runtime network beyond Home Assistant"; `//host/x` and
  `/\host/x` resolve to another origin. `renderFloor` writes the value through
  `esc` (finding 2). The overlay's "built from its own inlined table" comment
  in `overlay.ts` is updated to say the art URL is the one outside value and
  is validated by `artUrl`.
- A3. Markup (2D, and the 3D overlay that reuses the device markup): the
  glyph `<path>` stays; after it comes `<image class="art" href=… x="-4"
  y="-4" width="32" height="32" preserveAspectRatio="xMidYMid slice"
  clip-path="url(#fp-art-<i>)"/>` with a `<clipPath>` circle r 16 in the same
  svg, set as attributes (the camera cone's way). The device `g` gets class
  `art`. Attributes are always emitted in this order so the patch path
  (`morph` in `plan-patch.ts`) updates `href` in place.
- A4. CSS, each rule with a computed-style pair (finding 10):
  `.dev.art path{display:none}`;
  `.dev.art .halo{fill-opacity:0;stroke:var(--fp-dev);stroke-width:2;vector-effect:non-scaling-stroke}`
  (a ring in the media colour around the art; the waves stay);
  at `far` the art is hidden and the glyph shows again as the far dot
  (`[data-detail="far"] .dev.art .art{display:none}` and the glyph rule
  undone there). At `mid` the art shows.
- A5. Only while the entity state is `playing`. Each `media_player` is read
  on its own, so grouped speakers each show art if each reports it. Music
  Assistant can report a stale `idle` while playing (seen 2026-10-09); the
  card follows the entity and does not work around it. This goes in DECISIONS.
- A6. A failed load: `error` on an SVG `<image>` does not bubble, so the
  card adds a capturing `error` listener on the plan `<svg>` and on the 3D
  overlay root. It keeps a bounded set of failed hrefs (64, oldest dropped:
  entity state is untrusted and can churn URLs) and passes it as `artFailed`
  to `renderFloor` and `setLive`; a failed href draws the icon. A new href
  tries again.
- A7. The `token=` in `entity_picture_local` is Home Assistant's own
  short-lived proxy token, fetched by the browser from the same origin. Test
  fixtures and `npm run shots` use a fake token.

### Temperature colours

- H1. A pure `meanValue(list, state): { n: number; unit: string } | null` in
  `src/core/readings.ts`: the mean of the finite readings, unit of the first
  readable sensor, same selection as today. `meanReading` is rebuilt on top of
  it, so the text and the colour cannot differ. The colour number converts a
  `°F` mean to °C (`(f - 32) * 5 / 9`); the bounds are always °C.
- H2. A pure `heatT(value, min, max)`: `clamp((value - min) / (max - min), 0,
  1)`; `null` value is `null`. Bounds: `heat_min` and `heat_max` must be
  finite numbers with `min < max`, else both fall back to 17 and 25.
- H3. Colour: `t` 0 to 0.5 mixes `--fp-temp-cold` into `--fp-temp-mid`, 0.5
  to 1 mixes `--fp-temp-mid` into `--fp-temp-hot`. Not `--fp-heat-*`: those
  names are the plug power ramp (`--fp-heat-cool/mid/hot`, `--fp-heat`).
  Core writes the number `--fp-temp-t` on the element and one CSS
  `color-mix` rule makes the colour, as the plug ramp does (the `ha` theme's
  tokens are Home Assistant variables that JS cannot resolve). Every hand-written theme
  block and `rolesToTokens` define the three tokens (Home Assistant's light
  and dark modes included). The pill is the heat colour at a fixed share over
  the plan (35 %), and the text on it keeps `--fp-ink`, so it reads on every
  theme; the share is judged in the shots.
- H4. 2D room readout: the readout line is split so the temperature is its
  own `<tspan>` (humidity stays plain after " · "). Behind it a `<rect
  class="val-pill" rx=…>` sized by the same width estimate the room-name tag
  uses (`len(text) * 0.6 * size`, `lbl-tag`), with `--fp-temp-t` set to `t`. Both are emitted by `renderFloor` (finding 8). Rooms with no
  temperature, or with the switch off, draw exactly today's markup.
- H5. 2D temperature icon (`temp` device): its halo gets class `heat` and a
  ring in the temperature colour (the art ring's rule shape, A4), with
  `--fp-temp-t` from the device's own numeric state.
- H6. 3D: the overlay draws readouts and icons as HTML. `LiveRoom` gains
  `temp: string` (the temperature text), `rest: string` (humidity text) and
  `heat: number | null` (`t`), built in core by the same functions (`readout`
  stays for its other readers). The overlay draws the temperature in a
  `<span class="val-pill">` with a CSS pill (border-radius) in the colour; the
  `temp` device's disc gets the same ring as 2D. The overlay's change
  signature includes `heat`.
- H7. The far detail level: the readout and its pill follow today's far rule
  for readouts; the icon ring follows the icon.
### Switches, YAML and memory

- S1. View options gets two rows, "Cover art" and "Temperature colours".
- S2. View memory: `StoredView` gains `art?: boolean` and `heat?: boolean`,
  read with `typeof === "boolean"` as `labels` is. No version bump.
- S3. YAML: `media_art` (default `true`), `temp_colors` (default `true`),
  `heat_min` (17), `heat_max` (25). Junk is the default, lenient like
  `detail` (not throwing like `zoom`). All four join the view-memory storage
  key seed, as `detail` does, so a YAML change starts a clean memory.
- S4. The viewer's pick wins over YAML. Reset view clears the art and heat
  picks (as it clears the other `_picked*`); it does not touch Layers (today's
  behaviour).
- S5. The View options menu is absent under `kiosk` and `view_switch: false`.
  There the YAML value is the only control.
- S6. The config editor gets checkboxes for `media_art` and `temp_colors` and two
  number fields for the bounds, through `_set(key, value, default)`.
- S7. No new animation. Reduced motion is unaffected (the waves already
  follow it).

## Schema

No layout schema change. Card config: `media_art`, `temp_colors`, `heat_min`,
`heat_max` in `FloorplanStudioCardConfig`. Docs: `docs/card.md` config table,
`docs/SPEC.md` card behaviours, `CHANGELOG.md`, `FORK.md`, a `DECISIONS.md`
entry.

## Acceptance criteria

Layers in 3D
1. In live 3D a real click on the Lights chip leaves the overlay's `state()`
   with no light icon, `live().balls` with no light ball and `live().pools`
   empty; the toggle reads "Layers · 1 hidden"; a second click brings all
   three back.
2. A light located by search stays on the overlay with Lights hidden.
3. The Furniture chip is disabled in 3D and enabled in 2D, and its stored
   state is unchanged by the switch.
4. With Lights hidden, switching 3D to 2D shows no `g.dev-light` in the svg,
   and back to 3D shows no light icon in `state()`.

Cover art
5. `artUrl` unit tests: `entity_picture_local` wins; relative
   `entity_picture` is the fallback; `//h/x`, `/\h/x`, `javascript:x`,
   `data:image/png;base64,x`, `"><script>`, a 3000-character string and
   `http://192.168.1.10:8095/imageproxy/x` are all `null`.
6. A `speaker` playing with a valid `entity_picture_local` draws `image.art`
   with that href in 2D and in the 3D overlay; `paused`, `idle`, `off` and
   `unavailable` draw the glyph and no image.
7. In the 3D harness, each refused URL from AC 5 used as state draws the
   glyph and records no off-origin request.
8. A failing image (a 404 route) is replaced by the glyph; a new href draws
   an image again.
9. Patch path: an expando put on another device's `g[data-x]` survives a
   `hass` update that changes the art href, and the `image.art` element is
   the same node with the new href.
10. Computed-style pairs: the glyph is `display:none` and the halo ring has
    stroke and no fill under `.art`; at `far` the art is hidden and the glyph
    shows.
11. "Cover art" off draws the glyph only; the pick survives a reload; YAML
    `media_art: false` starts off; junk YAML is on; Reset view returns to the
    YAML value.

Temperature colours
12. Pure: `heatT` at min, mid, max, below, above, `NaN`, `null`;
    bounds with `min >= max`, `NaN` and strings fall back to 17 and 25;
    `meanValue` over finite readings only, `null` with none, °F converted;
    the readout text of `meanReading` is unchanged on the existing tests.
13. 2D, bounds 16 and 26: rooms at 16, 21 and 26 °C draw `rect.val-pill`
    whose computed fill is the exact colour computed in the test from the
    theme's tokens; a room with humidity only has no pill; the readout text
    is unchanged character for character.
14. A `temp` device at 16 and 26 °C has a ring of the cold and hot colour
    (computed style).
15. 3D: the overlay's readout for the same rooms has `span.val-pill` with
    the same colours, and a state change from 16 to 26 °C recolours it.
16. Switch off: no `val-pill` and no ring in 2D or 3D; the pick survives a
    reload; YAML `temp_colors: false` starts off; junk YAML is on; Reset view
    returns to the YAML value; bad bounds behave as 17 and 25.
17. Every theme, Home Assistant light and dark included, resolves
    `--fp-temp-cold`, `--fp-temp-mid` and `--fp-temp-hot` in Chromium.

Every visible change is rendered (`npm run shots` and phone-width
screenshots) and looked at in light, Home Assistant dark and blueprint; on
dark themes the room name and readout stay readable on a hot and a cold room.

## Non-goals

- The Security lens.
- Hiding furniture in 3D.
- Media controls or a now-playing row in the popup or room panel.
- Cover art on TVs and on unlinked speaker objects.
- A room-fill heatmap and a legend (replaced by the pill).
- Temperature colours in the Studio (editor).
- Colouring humidity or other readings.
