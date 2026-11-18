import * as THREE from "three";
import { block, doorway, lightPool, mat, place, SHARED_BGM, textPlane, texMat, type Box, type SpaceDef, type SpaceId } from "../world.ts";
import { roomShell } from "./room.ts";

// My Room (the user, 11/18): every account's own room, "home-<name>", in the residence at the west
// end of the north row (its door: backdrop.ts; server/spaces.ts HOME_DOOR). A small bedsit: a desk
// under the window where you sit to work, a bed, a bookcase, a sofa, a rug, a plant and a lamp. Its
// owner moves each piece and picks its finish, the walls and the floor (myroomui.ts); the layout
// comes from the server (server/myroom.ts) and everyone inside sees it change. Same sizes as the
// server's HOME_HALF.

export const HOME_HALF = { halfX: 6, halfZ: 5 };
/** Where you stand to use the room's own door, on the west wall near the front (never in front of the camera). */
export const HOME_INNER_DOOR = { x: -HOME_HALF.halfX + 0.9, z: 3.4 };
/** Where you appear coming in: just inside that door, out of its reach. */
export const HOME_ARRIVE = { x: -HOME_HALF.halfX + 2.6, z: 3.4 };
/** Where the residence's door is outside (same as server/spaces.ts HOME_DOOR). */
export const HOME_DOOR = { x: -48.6, z: -38.9 };

export const FURNITURE = ["desk", "bed", "bookcase", "sofa", "rug", "plant", "lamp", "table"] as const;
export type FurnitureId = (typeof FURNITURE)[number];
export interface Piece {
  id: FurnitureId;
  x: number;
  z: number;
  turn: number;
  finish: number;
}
export interface Layout {
  pieces: Piece[];
  wall: number;
  floor: number;
}
export const DEFAULT_LAYOUT: Layout = {
  wall: 0,
  floor: 0,
  pieces: [
    { id: "desk", x: -3.5, z: -3.6, turn: 0, finish: 0 },
    { id: "bed", x: 4, z: -2.6, turn: 0, finish: 0 },
    { id: "bookcase", x: 0.5, z: -4.3, turn: 0, finish: 0 },
    { id: "rug", x: 0, z: 0.5, turn: 0, finish: 0 },
    { id: "plant", x: -5.2, z: -4.2, turn: 0, finish: 0 },
    { id: "sofa", x: 1.6, z: 3.4, turn: 2, finish: 0 },
    { id: "lamp", x: 5.3, z: 0.6, turn: 0, finish: 0 },
  ],
};

/** What each piece is called in the editor, and its footprint (w along x, d along z, unturned). */
export const PIECE_INFO: Record<FurnitureId, { label: string; w: number; d: number; walkOver?: boolean }> = {
  desk: { label: "Desk and chair", w: 1.6, d: 1.3 },
  bed: { label: "Bed", w: 1.6, d: 2.3 },
  bookcase: { label: "Bookcase", w: 1.6, d: 0.5 },
  sofa: { label: "Sofa", w: 2, d: 0.9 },
  rug: { label: "Rug", w: 2.6, d: 1.8, walkOver: true },
  plant: { label: "Plant", w: 0.6, d: 0.6 },
  lamp: { label: "Floor lamp", w: 0.5, d: 0.5 },
  table: { label: "Coffee table", w: 1.1, d: 0.7 },
};

/** The six finishes a piece can take: [name, main colour, accent colour]. */
export const FINISHES: [string, number, number][] = [
  ["Oak", 0xc49a6c, 0x5d7a99],
  ["Walnut", 0x6e4a32, 0xb5654a],
  ["White", 0xeeeae2, 0x8aa6a3],
  ["Sage", 0x9bb28f, 0xe8d8b8],
  ["Navy", 0x34486b, 0xd6b45a],
  ["Blush", 0xe2b4ae, 0x6b5a7a],
];
/** Wall paints and floors, by index (same counts as server/myroom.ts WALLS and FLOORS). */
// Bright pastels near the primaries (the user, 11/18: the first ones were too grey to tell apart);
// buildShell paints the 3D walls so that on screen they look like these swatches.
/** Takes back the plaster texture's warm cast (its mean colour is 243/229/210): red and green down to blue's level. */
const PLASTER_CAST = new THREE.Color().setRGB(210 / 243, 210 / 229, 1, THREE.SRGBColorSpace);
export const WALLS: [string, number][] = [
  ["Butter", 0xffe680],
  ["Mint", 0x9ff0b8],
  ["Sky", 0x9fd2ff],
  ["Peach", 0xffb48a],
  ["Lilac", 0xc9a8ff],
  ["Rose", 0xff9fc0],
];
export const FLOORS: [string, string, number][] = [
  ["Light wood", "ai/wood_floor.jpg", 0xffffff],
  ["Dark wood", "ai/wood_floor.jpg", 0x8a6a52],
  ["Grey carpet", "ai/carpet.jpg", 0xe0e0e0],
  ["Green carpet", "ai/carpet.jpg", 0xd2ecd0],
  ["Rose carpet", "ai/carpet.jpg", 0xffd8d2],
];

/** A piece's footprint once turned (a quarter turn swaps width and depth). */
export function footprint(p: Piece): { w: number; d: number } {
  const info = PIECE_INFO[p.id];
  return p.turn % 2 ? { w: info.d, d: info.w } : { w: info.w, d: info.d };
}

/** The room as it stands: rebuilt in place when its layout changes. */
export interface HomeSpace extends SpaceDef {
  /** Lays out the furniture, walls and floor (the owner's choice, from the server). */
  setLayout(layout: Layout): void;
  layout(): Layout;
}

/** Whose room a space id is (lower case), or null. */
export const homeOwnerOf = (id: SpaceId): string | null => /^home-([a-z0-9_]{1,12})$/.exec(id)?.[1] ?? null;

export function buildMyRoom(id: SpaceId): HomeSpace {
  const g = new THREE.Group();
  const shell = new THREE.Group();
  const furniture = new THREE.Group();
  g.add(shell, furniture);
  const colliders: Box[] = [];
  const fixed: Box[] = [];
  let current: Layout = structuredClone(DEFAULT_LAYOUT);
  const owner = homeOwnerOf(id) ?? "";

  const seats: SpaceDef["seats"] = [];
  const spots: NonNullable<SpaceDef["spots"]> = [];

  function buildShell(layout: Layout): void {
    shell.clear();
    fixed.length = 0;
    const [, wallSwatch] = WALLS[layout.wall] ?? WALLS[0]!;
    // The plaster texture is warm ivory and multiplies the paint, which turned a blue or a lilac grey.
    // So the paint takes back that cast: on screen the wall then looks like the swatch you picked.
    const wallTint = new THREE.Color(wallSwatch).multiply(PLASTER_CAST).getHex();
    const [, floorFile, floorTint] = FLOORS[layout.floor] ?? FLOORS[0]!;
    roomShell(shell, fixed, HOME_HALF.halfX, HOME_HALF.halfZ, texMat(floorFile, 5, 4, floorTint), { tint: wallTint, trim: 0x6b4e36 });
    // ACES tone mapping halved the paints' saturation (measured on screen): the walls skip it.
    shell.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial && m.color.getHex() === wallTint) m.toneMapped = false;
    });
    // A window on the back wall with daylight in it, and the owner's name over the door.
    const frame = mat(0x5a4030);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd8ec, emissive: 0xcfe4f5, emissiveIntensity: 0.55, roughness: 0.2 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), glass);
    win.position.set(-3.5, 2.3, -HOME_HALF.halfZ + 0.02);
    shell.add(win);
    for (const [w, h, x, y] of [[2.8, 0.1, -3.5, 3.1], [2.8, 0.1, -3.5, 1.5], [0.1, 1.7, -4.85, 2.3], [0.1, 1.7, -2.15, 2.3], [0.06, 1.6, -3.5, 2.3]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frame);
      bar.position.set(x, y, -HOME_HALF.halfZ + 0.05);
      shell.add(bar);
    }
    lightPool(shell, -3.5, -2.2, 3.2, 3.4, 0xfff0d0, 0.18);
    const sign = textPlane([`${owner}'s room`], 3.2, 0.6, { bg: "#5b3a24", fg: "#ffffff", font: 0.32 });
    sign.position.set(2.6, 3.3, -HOME_HALF.halfZ + 0.02);
    shell.add(sign);
    doorway(shell, -HOME_HALF.halfX - 0.05, HOME_INNER_DOOR.z, Math.PI / 2, "Out to the campus");
  }

  /** One piece, at the origin facing +z; the caller moves and turns it. */
  function piece(p: Piece): THREE.Group {
    const o = new THREE.Group();
    const [, main, accent] = FINISHES[p.finish] ?? FINISHES[0]!;
    const wood = mat(main);
    const soft = mat(accent);
    switch (p.id) {
      case "desk": {
        block(o, null, [1.5, 0.06, 0.75], [0, -0.25, 0.74], wood);
        for (const [x, z] of [[-0.7, -0.57], [0.7, -0.57], [-0.7, 0.07], [0.7, 0.07]]) block(o, null, [0.06, 0.74, 0.06], [x!, z!], wood);
        place(o, "laptop.glb", 0.25, 0.1, -0.3, 0, true, 0.77);
        place(o, "lampSquareTable.glb", 0.45, -0.55, -0.45, 0, true, 0.77);
        place(o, "chairDesk.glb", 1, 0, 0.35, Math.PI, true, 0, { carpet: accent });
        break;
      }
      case "bed": {
        block(o, null, [1.5, 0.35, 2.2], [0, 0], wood);
        block(o, null, [1.6, 0.9, 0.08], [0, -1.12], wood);
        block(o, null, [1.4, 0.18, 2.05], [0, 0.02, 0.35], mat(0xf6f2ea));
        block(o, null, [1.42, 0.06, 1.3], [0, 0.4, 0.53], soft);
        block(o, null, [0.9, 0.14, 0.4], [0, -0.75, 0.53], mat(0xffffff));
        break;
      }
      case "bookcase":
        place(o, "bookcaseOpen.glb", 1.9, 0, 0, 0, true, 0, { wood: main });
        place(o, "books.glb", 0.25, -0.3, 0.05, 0, true, 0.95);
        break;
      case "sofa":
        place(o, "loungeSofa.glb", 0.85, 0, 0, 0, true, 0, { carpet: accent, wood: main });
        break;
      case "rug": {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), mat(accent));
        rug.rotation.x = -Math.PI / 2;
        rug.position.y = 0.012;
        o.add(rug);
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.5), mat(main));
        edge.rotation.x = -Math.PI / 2;
        edge.position.y = 0.014;
        o.add(edge);
        break;
      }
      case "plant":
        place(o, "pottedPlant.glb", 1.3, 0, 0);
        break;
      case "lamp":
        place(o, "lampRoundFloor.glb", 1.7, 0, 0);
        break;
      case "table":
        place(o, "tableCoffeeGlass.glb", 0.45, 0, 0);
        place(o, "plantSmall1.glb", 0.25, 0.2, 0, 0, true, 0.42);
        break;
    }
    o.position.set(p.x, 0, p.z);
    o.rotation.y = (p.turn * Math.PI) / 2;
    o.userData.piece = p.id;
    return o;
  }

  function buildFurniture(layout: Layout): void {
    furniture.clear();
    colliders.length = 0;
    colliders.push(...fixed);
    seats!.length = 0;
    spots.length = 0;
    for (const p of layout.pieces) {
      furniture.add(piece(p));
      const { w, d } = footprint(p);
      if (!PIECE_INFO[p.id].walkOver) {
        const box: Box = { minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 };
        // The bed and the sofa are low: you can jump over them (and the desk's chair is its seat).
        if (p.id === "bed") box.top = 0.55;
        if (p.id === "sofa") box.top = 0.5;
        colliders.push(box);
      }
      // Sit at the desk (on its chair) or on the sofa; lie... well, sit on the bed's edge.
      const turn = (p.turn * Math.PI) / 2;
      const at = (lx: number, lz: number): { x: number; z: number } => ({ x: p.x + lx * Math.cos(turn) + lz * Math.sin(turn), z: p.z - lx * Math.sin(turn) + lz * Math.cos(turn) });
      if (p.id === "desk") {
        const s = at(0, 0.35);
        // Facing the desk: the chair looks along -z in the desk's own frame.
        seats!.push({ ...s, rot: turn + Math.PI, y: 0.45 });
        spots.push({ ...at(0, 0.95), id: "home:desk", label: "Sit at the desk · notebook and calendar" });
      }
      if (p.id === "sofa") for (const lx of [-0.45, 0.45]) seats!.push({ ...at(lx, 0.1), rot: turn, y: 0.42 });
      if (p.id === "bed") seats!.push({ ...at(0, 0.9), rot: turn + Math.PI / 2, y: 0.55 });
    }
  }

  const def: HomeSpace = {
    id,
    title: `${owner}'s room`,
    group: g,
    colliders,
    doors: [{ x: HOME_INNER_DOOR.x, z: HOME_INNER_DOOR.z, label: "Out to the campus", to: "outdoor", arrive: { x: HOME_DOOR.x, z: HOME_DOOR.z + 1.4 } }],
    ...HOME_HALF,
    background: 0xd9d4c6,
    camera: new THREE.Vector3(0, 7, 8),
    bgm: SHARED_BGM,
    floor: "wood",
    noNotes: true,
    seats,
    spots,
    setLayout(layout) {
      const shellChanged = layout.wall !== current.wall || layout.floor !== current.floor || shell.children.length === 0;
      current = structuredClone(layout);
      if (shellChanged) buildShell(current);
      buildFurniture(current);
    },
    layout: () => structuredClone(current),
  };
  def.setLayout(current);
  return def;
}
