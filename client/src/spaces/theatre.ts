import * as THREE from "three";
import { block, doorway, lightPool, mat, place, SHARED_BGM, solid, texMat, textPlane, type Box, type SpaceDef } from "../world.ts";
import { roomShell } from "./room.ts";

// The lecture theatre (the user, 11/18): reached through the passage under the north row, between
// the pale-brick building and the O'Donoghue centre (backdrop.ts; door in outdoor.ts). Like a
// cinema: five tiers of ten seats (50) rising toward the back, one big screen at the front with a
// lectern beside it. The screen's picture is the room's video, drawn over the 3D screen by the
// page (theatreui.ts, which reads SCREEN to know where it is). Same bounds as server/spaces.ts.

export const THEATRE_HALF = { halfX: 13, halfZ: 12 };
/** The big screen: its centre, width and height, on the front (north) wall. */
export const SCREEN = { x: 0, y: 4.6, z: -THEATRE_HALF.halfZ + 0.06, w: 16, h: 9 };
/** The lectern, front left: where staff stand to lecture. */
export const LECTERN = { x: -7.5, z: -7.6 };
const ROWS = 5;
const PER_ROW = 10;
/** Row r's depth (z) and how high its step is. */
const rowZ = (r: number): number => -2.6 + r * 2.4;
const rowY = (r: number): number => 0.35 * (r + 1);

export function buildTheatre(): SpaceDef {
  const g = new THREE.Group();
  const colliders: Box[] = [];
  const { halfX, halfZ } = THEATRE_HALF;
  roomShell(g, colliders, halfX, halfZ, texMat("ai/carpet.jpg", 12, 10, 0x6a5560), { tint: 0x3d3a44, trim: 0x22202a });

  // The front wall rises well above the others (a cinema's), to hold the big screen.
  const front = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2 + 0.6, 10, 0.3), mat(0x2c2a33));
  front.position.set(0, 5, -halfZ - 0.15);
  g.add(front);
  // The screen: a white panel in a dark frame, softly lit, and the stage in front of it.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.5, SCREEN.h + 0.5, 0.1), mat(0x15151a));
  frame.position.set(SCREEN.x, SCREEN.y, SCREEN.z - 0.02);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ color: 0x1b1d24 }));
  panel.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.04);
  panel.name = "theatre-screen";
  g.add(frame, panel);
  const idle = textPlane(["Lecture theatre", "the lecturer's video shows here"], 9, 2, { bg: "#1b1d24", fg: "#cfd3dc", font: 0.55 });
  idle.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.05);
  idle.name = "theatre-idle";
  g.add(idle);
  block(g, colliders, [halfX * 2, 0.3, 3.4], [0, -halfZ + 1.7], texMat("ai/wood_floor.jpg", 6, 1, 0x9a7656));
  // The lectern, front left, with a lamp on it.
  block(g, colliders, [1.1, 1.15, 0.7], [LECTERN.x, LECTERN.z - 0.5, 0], texMat("ai/wood_tabletop.jpg", 1, 1, 0x7a5638));
  place(g, "laptop.glb", 0.25, LECTERN.x, LECTERN.z - 0.5, Math.PI, true, 1.15);
  const sign = textPlane(["Lecturer"], 1.2, 0.32, { bg: "#22202a", fg: "#ffffff", font: 0.2 });
  sign.position.set(LECTERN.x, 0.8, LECTERN.z - 0.14);
  g.add(sign);

  // Five tiers, each a step higher, ten seats a row with an aisle down the middle.
  const seats: NonNullable<SpaceDef["seats"]> = [];
  const step = mat(0x4a4450);
  const nose = mat(0x8a7a5a);
  const fabric = mat(0x8e2f3a);
  for (let r = 0; r < ROWS; r++) {
    const z = rowZ(r);
    const y = rowY(r);
    // The step runs the whole width under the row; you walk up the aisle onto it.
    const tier = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, y, 2.4), step);
    tier.position.set(0, y / 2, z + 0.2);
    g.add(tier);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, 0.04, 0.08), nose);
    edge.position.set(0, y + 0.01, z - 1.0);
    g.add(edge);
    colliders.push({ minX: -halfX, maxX: halfX, minZ: z - 1, maxZ: z + 1.4, top: y, standOn: true });
    for (let i = 0; i < PER_ROW; i++) {
      // Five each side of a 2 m aisle.
      const x = (i < 5 ? -1 : 1) * (1.6 + (i % 5) * 1.6);
      const seat = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.8), fabric);
      base.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.12), fabric);
      back.position.set(0, 0.85, 0.42);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.6), mat(0x2a2a30));
      legs.position.y = 0.2;
      seat.add(legs, base, back);
      seat.position.set(x, y, z);
      g.add(seat);
      seats.push({ x, z, rot: Math.PI, y: y + 0.45 });
    }
  }
  // Lights down the walls, and a soft wash on the screen's floor.
  for (const side of [-1, 1])
    for (const z of [-6, 0, 6]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd88a, emissiveIntensity: 0.9 }));
      lamp.position.set(side * (halfX - 0.05), 2.6, z);
      g.add(lamp);
    }
  lightPool(g, 0, -halfZ + 3, halfX * 1.6, 5, 0xbfd4ff, 0.12);
  solid(colliders, 0.6, 0.6, halfX - 0.6, -halfZ + 0.6);

  // The way out: the back wall's west corner, behind the top row.
  doorway(g, -halfX - 0.05, halfZ - 1.6, Math.PI / 2, "Out to the north road");

  return {
    id: "theatre",
    title: "Lecture theatre",
    group: g,
    colliders,
    doors: [{ x: -halfX + 1.1, z: halfZ - 1.6, label: "Out to the north road", to: "outdoor", arrive: { x: 7, z: -37.6 } }],
    ...THEATRE_HALF,
    background: 0x24222a,
    // High and well back, looking toward the screen (focus), like a seat at the back of a cinema.
    camera: new THREE.Vector3(0, 11, 13),
    focus: new THREE.Vector3(SCREEN.x, SCREEN.y - 0.6, SCREEN.z + 2),
    bgm: SHARED_BGM,
    floor: "carpet",
    noNotes: true,
    light: 0.75,
    seats,
  };
}
