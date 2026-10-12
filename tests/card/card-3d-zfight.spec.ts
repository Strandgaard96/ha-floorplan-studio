import { test, expect, type Page } from "@playwright/test";
import { demo, open, drawn } from "./helpers-3d";

// Coplanar faces flickered while the 3D view turned: a window's or a door's frame shares planes with its wall (a jamb's face is
// the wall's end face at the gap, the head's underside the underside of the wall above, every top the wall's top where the wall
// is cut), and a TV box set into a wall shares the wall's face. Which of two coplanar faces wins the depth test then changed with
// every small turn. The frame, every furniture piece and a device's body are pulled toward the camera (polygon offset), and a TV's
// screen further than its body, so each tie always goes the same way. The meshes' own materials, read through `__fp3d.offsets()`.
interface Drawn {
  what: string;
  roles: string[];
  offset: number;
}
const offsets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fp3d: { offsets(): unknown } }).__fp3d.offsets()) as Promise<Drawn[]>;

async function boot(page: Page) {
  const layout = structuredClone(demo);
  // A linked TV set into the west wall, as a hand-placed plan can have it, and a TV device on the same wall.
  layout.floors.ground.furniture.push({
    id: "tv-box",
    symbol: "tv",
    x: 5,
    y: 200,
    rot: 90,
    w: 120,
    h: 10,
    entity: "media_player.tv",
  });
  layout.floors.ground.devices.push({ id: "tv-dev", type: "tv", entity: "media_player.tv2", x: 20, y: 320 });
  await open(page, { layout, floor: "ground", view: "3d", active_list: false, walls: "full" });
  await drawn(page);
}

test("a frame, a piece and a device body are pulled forward; a wall is not", async ({ page }) => {
  await boot(page);
  const all = await offsets(page);
  const frames = all.filter((m) => m.roles.includes("frame"));
  expect(frames.length).toBeGreaterThan(0);
  for (const m of frames) {
    expect(m.offset, `${m.what} ${m.roles}`).toBeLessThan(0);
    expect(
      m.roles.filter((r) => r.startsWith("wall-")),
      "a frame never shares a mesh with a wall",
    ).toEqual([]);
  }
  const walls = all.filter((m) => m.roles.some((r) => r.startsWith("wall-")));
  expect(walls.length).toBeGreaterThan(0);
  for (const m of walls) expect(m.offset, `${m.what} ${m.roles}`).toBe(0);
  const piece = all.find((m) => m.what === "piece"),
    body = all.find((m) => m.what === "body" && m.roles.includes("device-tv")),
    screen = all.find((m) => m.what === "screen");
  expect(piece?.offset).toBeLessThan(0);
  expect(body?.offset).toBeLessThan(0);
  expect(screen?.offset, "the screen wins against its own body").toBeLessThan(body!.offset);
});
