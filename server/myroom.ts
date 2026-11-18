// My Room (the user, 11/18): every account has a room of its own, with a Markdown notebook, a
// personal calendar (its own events, and dates copied in from ANU's academic calendar) and the
// furniture where its owner put it, in the colours they picked. Only its owner reads or changes
// these; visitors they invite see the room and its furniture, never the notebook or calendar.
//
// This file holds the rules that need no database: what a notebook, an event or a layout may be.
// db.ts keeps a member's; a guest's live in server memory only and are gone when they leave the
// room (guests keep as little as possible), which the room says on the way in.

/** The notebook's longest text, like a meeting room's shared notes. */
export const NOTEBOOK_MAX = 5000;
/** Events in a personal calendar at most. */
export const CAL_MAX = 200;
export const CAL_TITLE_MAX = 80;

export interface CalEntry {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** YYYY-MM-DD, for a range (a teaching period, a break). */
  end?: string;
  title: string;
  /** Copied from the academic calendar (its kind) or "mine". */
  kind: "mine" | "teaching" | "census" | "exam" | "break" | "holiday" | "other";
}

/** The furniture a room may hold, by id; each is placed once (or not at all). */
export const FURNITURE = ["desk", "bed", "bookcase", "sofa", "rug", "plant", "lamp", "table"] as const;
export type FurnitureId = (typeof FURNITURE)[number];
/** Colours (or wood and fabric finishes) a piece can take, by index into the client's palette. */
export const FINISHES = 6;
/** The room's floor: half sizes, as the client builds it (client/src/spaces/myroom.ts). */
export const HOME_HALF = { x: 6, z: 5 };
/** Wallpaper and floor choices, by index. */
export const WALLS = 6;
export const FLOORS = 5;

export interface Piece {
  id: FurnitureId;
  x: number;
  z: number;
  /** Quarter turns, 0..3. */
  turn: number;
  finish: number;
}
export interface Layout {
  pieces: Piece[];
  wall: number;
  floor: number;
}

/** Where a new room's furniture starts: a desk under the window, a bed, a shelf, a rug and a plant. */
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (s: string): boolean => {
  if (!DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const KINDS = new Set<CalEntry["kind"]>(["mine", "teaching", "census", "exam", "break", "holiday", "other"]);

/** The notebook's text, or why it can't be kept. */
export function notebookError(text: unknown): string | null {
  if (typeof text !== "string") return "That isn't text.";
  if (text.length > NOTEBOOK_MAX) return `Keep it under ${NOTEBOOK_MAX} characters.`;
  return null;
}

/** A calendar entry as sent, tidied, or why it can't be kept. Ids are the server's. */
export function calEntry(raw: unknown, id: string): { ok: true; entry: CalEntry } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "That isn't an event." };
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().replace(/\s+/g, " ") : "";
  if (!title) return { ok: false, error: "Give it a title." };
  if (title.length > CAL_TITLE_MAX) return { ok: false, error: `Keep the title under ${CAL_TITLE_MAX} characters.` };
  if (typeof r.date !== "string" || !realDay(r.date)) return { ok: false, error: "Pick a day." };
  let end: string | undefined;
  if (r.end !== undefined && r.end !== null && r.end !== "") {
    if (typeof r.end !== "string" || !realDay(r.end) || r.end < r.date) return { ok: false, error: "The end can't be before the start." };
    end = r.end === r.date ? undefined : r.end;
  }
  const kind = typeof r.kind === "string" && KINDS.has(r.kind as CalEntry["kind"]) ? (r.kind as CalEntry["kind"]) : "mine";
  return { ok: true, entry: { id, date: r.date, ...(end ? { end } : {}), title, kind } };
}

/** A layout as sent, checked piece by piece (known furniture, once each, on the floor), or null. */
export function cleanLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, max: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : null);
  const wall = int(r.wall, WALLS);
  const floor = int(r.floor, FLOORS);
  if (wall === null || floor === null || !Array.isArray(r.pieces) || r.pieces.length > FURNITURE.length) return null;
  const seen = new Set<string>();
  const pieces: Piece[] = [];
  for (const p of r.pieces as unknown[]) {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    if (typeof q.id !== "string" || !(FURNITURE as readonly string[]).includes(q.id) || seen.has(q.id)) return null;
    seen.add(q.id);
    const turn = int(q.turn, 4);
    const finish = int(q.finish, FINISHES);
    if (turn === null || finish === null || typeof q.x !== "number" || typeof q.z !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.z)) return null;
    // On the floor, half a metre in from the walls.
    const x = Math.round(Math.max(-HOME_HALF.x + 0.5, Math.min(HOME_HALF.x - 0.5, q.x)) * 10) / 10;
    const z = Math.round(Math.max(-HOME_HALF.z + 0.5, Math.min(HOME_HALF.z - 0.5, q.z)) * 10) / 10;
    pieces.push({ id: q.id as FurnitureId, x, z, turn, finish });
  }
  return { wall, floor, pieces };
}

/** A guest's room, kept in memory only until they leave it. */
export interface GuestRoom {
  notebook: string;
  calendar: CalEntry[];
  layout: Layout;
}
const guestRooms = new Map<string, GuestRoom>();
export const guestRoom = (name: string): GuestRoom => {
  const key = name.toLowerCase();
  let r = guestRooms.get(key);
  if (!r) guestRooms.set(key, (r = { notebook: "", calendar: [], layout: structuredClone(DEFAULT_LAYOUT) }));
  return r;
};
/** A guest left their room: everything in it goes. */
export const forgetGuestRoom = (name: string): void => void guestRooms.delete(name.toLowerCase());
