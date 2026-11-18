import { afterEach, describe, expect, it } from "vitest";
import { api, closeAll, connect, guest, visitor, type Msg } from "./helpers.ts";

// My Room (server/myroom.ts, the user 11/18): every account has a room of its own. Its owner always
// gets in; anyone else only when someone inside has invited them. Its notebook and calendar are the
// owner's alone; its furniture is seen by whoever is in the room, and only the owner moves it. A
// member's is kept in SQLite; a guest's only in memory, gone when they leave.

afterEach(closeAll);

const home = (name: string): string => `home-${name.toLowerCase()}`;
const opened = (space: string) => (m: Msg) => m.t === "action" && m.kind === "room-open" && m.space === space;
const refused = (space: string, reason: string) => (m: Msg) => m.t === "action" && m.kind === "room-refused" && m.space === space && m.reason === reason;

async function walkIn(token: string, space: string) {
  const s = await connect(token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space, x: 0, z: 0 });
  return s;
}

describe("My Room", () => {
  it("lets its owner in, and anyone else only once someone inside invites them", async () => {
    const owner = await visitor();
    const friend = await visitor();
    const room = home(owner.name);
    const so = await walkIn(owner.token, room);
    await expect(so.next(opened(room))).resolves.toBeTruthy();
    // Not invited: turned away.
    const sf = await walkIn(friend.token, room);
    await expect(sf.next(refused(room, "not invited"))).resolves.toBeTruthy();
    // Invited from inside: let in.
    so.send({ t: "invite", name: friend.name });
    await expect(sf.next((m) => m.t === "action" && m.kind === "room-invited" && m.space === room)).resolves.toBeTruthy();
    sf.send({ t: "enter", space: room, x: 0, z: 0 });
    await expect(sf.next(opened(room))).resolves.toBeTruthy();
  }, 12_000);

  it("keeps a member's notebook, calendar and furniture, and shows them to nobody else", async () => {
    const owner = await visitor();
    const other = await visitor();
    const put = await api("/api/myroom", "PUT", {
      token: owner.token,
      notebook: "# Week 3\n- read the paper",
      calendar: [{ title: "Lab report due", date: "2026-11-20" }],
      layout: { wall: 2, floor: 1, pieces: [{ id: "desk", x: 1, z: -2, turn: 1, finish: 3 }] },
    });
    expect(put.status).toBe(200);
    const mine = (await (await api(`/api/myroom?token=${owner.token}`)).json()) as Record<string, unknown>;
    expect(mine.notebook).toBe("# Week 3\n- read the paper");
    expect((mine.calendar as { title: string }[])[0]!.title).toBe("Lab report due");
    expect((mine.layout as { wall: number }).wall).toBe(2);
    // Someone else asking gets their own (empty) room, never the owner's.
    const theirs = (await (await api(`/api/myroom?token=${other.token}`)).json()) as Record<string, unknown>;
    expect(theirs.notebook).toBe("");
    expect(theirs.calendar).toEqual([]);
    // And the furniture only to someone standing in the room.
    expect((await api(`/api/myroom/layout?token=${other.token}`)).status).toBe(403);
  });

  it("refuses a notebook that's too long, a bad date and furniture that isn't on the list", async () => {
    const v = await visitor();
    expect((await api("/api/myroom", "PUT", { token: v.token, notebook: "x".repeat(5001) })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 550));
    expect((await api("/api/myroom", "PUT", { token: v.token, calendar: [{ title: "x", date: "2026-02-30" }] })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 550));
    expect((await api("/api/myroom", "PUT", { token: v.token, layout: { wall: 0, floor: 0, pieces: [{ id: "piano", x: 0, z: 0, turn: 0, finish: 0 }] } })).status).toBe(400);
    expect((await api("/api/myroom", "PUT", { notebook: "no token" })).status).toBe(401);
  });

  it("tells the room when its owner moves the furniture", async () => {
    const owner = await visitor();
    const friend = await visitor();
    const room = home(owner.name);
    const so = await walkIn(owner.token, room);
    await so.next(opened(room));
    so.send({ t: "invite", name: friend.name });
    const sf = await walkIn(friend.token, room);
    await sf.next((m) => m.t === "action" && (m.kind === "room-open" || m.kind === "room-invited"));
    sf.send({ t: "enter", space: room, x: 0, z: 0 });
    await sf.next(opened(room));
    await api("/api/myroom", "PUT", { token: owner.token, layout: { wall: 1, floor: 0, pieces: [{ id: "bed", x: 2, z: 2, turn: 0, finish: 1 }] } });
    await expect(sf.next((m) => m.t === "action" && m.kind === "home-layout" && (m.layout as { wall: number }).wall === 1)).resolves.toBeTruthy();
    // The friend sees the owner's furniture, not their notebook.
    const layout = (await (await api(`/api/myroom/layout?token=${friend.token}`)).json()) as Record<string, unknown>;
    expect(layout.owner).toBe(owner.name);
    expect(JSON.stringify(layout)).not.toContain("notebook");
  }, 12_000);

  it("gives a guest a room that is forgotten once they leave it", async () => {
    const g = await guest();
    const room = home(g.name);
    const s = await walkIn(g.token, room);
    await s.next(opened(room));
    expect((await api("/api/myroom", "PUT", { token: g.token, notebook: "temporary" })).status).toBe(200);
    expect(((await (await api(`/api/myroom?token=${g.token}`)).json()) as { notebook: string; guest: boolean }).notebook).toBe("temporary");
    s.send({ t: "enter", space: "outdoor", x: -19, z: -14 });
    await s.next((m) => m.t === "players");
    await new Promise((r) => setTimeout(r, 200));
    const after = (await (await api(`/api/myroom?token=${g.token}`)).json()) as { notebook: string; guest: boolean };
    expect(after.guest).toBe(true);
    expect(after.notebook).toBe("");
  });
});
