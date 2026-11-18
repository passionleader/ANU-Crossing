import { afterEach, describe, expect, it } from "vitest";
import { closeAll, connect, staffMember, visitor, type Msg } from "./helpers.ts";

// The lecture theatre (server/theatre.ts, the user 11/18): only staff put a video on its big screen
// and play, move or caption it (everyone's player shows the captions they pick); anyone in the theatre raises a hand (the lecturers there are told who) and
// asks in its Q&A (everyone there reads it). It lives in memory while someone is in it. There are five
// cinema rooms, "theatre-1" to "theatre-5" (the user, 11/18), each with its own screen, hands and Q&A.

afterEach(closeAll);

const act = (kind: string) => (m: Msg) => m.t === "action" && m.kind === kind;

async function inTheatre(who: { token: string }, room = 1) {
  const s = await connect(who.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space: `theatre-${room}`, x: 0, z: 8 });
  await s.next(act("theatre"));
  return s;
}

describe("the lecture theatre", () => {
  it("lets only staff put a video on the screen, and shows it to everyone there", async () => {
    const lecturer = await staffMember();
    const student = await visitor();
    const sl = await inTheatre(lecturer);
    const ss = await inTheatre(student);
    // A student can't.
    ss.send({ t: "action", kind: "theatre", what: "video", op: "set", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" });
    await expect(ss.next((m) => m.t === "action" && m.kind === "theatre-refused" && m.reason === "staff only")).resolves.toBeTruthy();
    // The lecturer can, and the student sees it.
    sl.send({ t: "action", kind: "theatre", what: "video", op: "set", url: "https://youtu.be/jNQXAC9IVRw" });
    const shown = await ss.next((m) => m.t === "action" && m.kind === "theatre-video" && !!m.video);
    expect((shown.video as { id: string; playing: boolean }).id).toBe("jNQXAC9IVRw");
    // The captions the lecturer picks go to everyone (the user, 11/18); a code that isn't one is refused.
    await new Promise((r) => setTimeout(r, 1050));
    sl.send({ t: "action", kind: "theatre", what: "video", op: "cc", lang: "ko" });
    await expect(ss.next((m) => m.t === "action" && m.kind === "theatre-video" && (m.video as { cc?: string } | null)?.cc === "ko")).resolves.toBeTruthy();
    await new Promise((r) => setTimeout(r, 1050));
    sl.send({ t: "action", kind: "theatre", what: "video", op: "cc", lang: "<b>" });
    await expect(sl.next((m) => m.t === "action" && m.kind === "theatre-refused" && m.reason === "captions")).resolves.toBeTruthy();
    // Not a YouTube or Vimeo address: refused, even for staff.
    await new Promise((r) => setTimeout(r, 1050));
    sl.send({ t: "action", kind: "theatre", what: "video", op: "set", url: "https://example.com/x" });
    await expect(sl.next((m) => m.t === "action" && m.kind === "theatre-refused" && m.reason === "link")).resolves.toBeTruthy();
  }, 12_000);

  it("tells the lecturer who raised a hand, and everyone the questions", async () => {
    const lecturer = await staffMember();
    const student = await visitor();
    const sl = await inTheatre(lecturer);
    const ss = await inTheatre(student);
    ss.send({ t: "action", kind: "theatre", what: "hand", up: true });
    await expect(sl.next((m) => m.t === "action" && m.kind === "theatre-hand-up" && m.name === student.name)).resolves.toBeTruthy();
    await expect(ss.next((m) => m.t === "action" && m.kind === "theatre-hands" && (m.hands as string[]).includes(student.name))).resolves.toBeTruthy();
    ss.send({ t: "action", kind: "theatre", what: "ask", text: "  Is the quiz   open book? " });
    const q = await sl.next((m) => m.t === "action" && m.kind === "theatre-ask");
    expect((q.question as { name: string; text: string }).text).toBe("Is the quiz open book?");
    expect((q.question as { name: string }).name).toBe(student.name);
    // The lecturer answers and puts the hand down.
    sl.send({ t: "action", kind: "theatre", what: "lower", name: student.name });
    await expect(ss.next((m) => m.t === "action" && m.kind === "theatre-hands" && (m.hands as string[]).length === 0)).resolves.toBeTruthy();
  }, 12_000);

  it("refuses a question too long or too soon", async () => {
    const student = await visitor();
    const s = await inTheatre(student);
    s.send({ t: "action", kind: "theatre", what: "ask", text: "x".repeat(301) });
    await expect(s.next((m) => m.t === "action" && m.kind === "theatre-refused" && m.reason === "too long")).resolves.toBeTruthy();
    s.send({ t: "action", kind: "theatre", what: "ask", text: "first" });
    s.send({ t: "action", kind: "theatre", what: "ask", text: "second" });
    await expect(s.next((m) => m.t === "action" && m.kind === "theatre-refused" && m.reason === "slow down")).resolves.toBeTruthy();
  });

  it("keeps each cinema room's screen, hands and questions to the people in it", async () => {
    const lecturer = await staffMember();
    const here = await visitor();
    const there = await visitor();
    const sl = await inTheatre(lecturer, 2);
    const sh = await inTheatre(here, 2);
    const st = await inTheatre(there, 3);
    sl.send({ t: "action", kind: "theatre", what: "video", op: "set", url: "https://youtu.be/jNQXAC9IVRw" });
    await expect(sh.next((m) => m.t === "action" && m.kind === "theatre-video" && !!m.video)).resolves.toBeTruthy();
    sh.send({ t: "action", kind: "theatre", what: "hand", up: true });
    await expect(sl.next((m) => m.t === "action" && m.kind === "theatre-hand-up")).resolves.toBeTruthy();
    // Room 3 hears none of it, and its screen is still empty for someone coming in.
    expect(await st.sees((m) => m.t === "action" && (m.kind === "theatre-video" || m.kind === "theatre-hand-up" || m.kind === "theatre-hands"), 400)).toBe(false);
    const late = await inTheatre(await visitor(), 3);
    expect((await late.next((m) => m.t === "action" && m.kind === "theatre")).video).toBeNull();
  }, 12_000);

  it("has five cinema rooms and no sixth, nor the single theatre there was before", async () => {
    const s = await connect((await visitor()).token);
    await s.next((m) => m.t === "welcome");
    s.send({ t: "enter", space: "theatre-5", x: 0, z: 8 });
    await expect(s.next((m) => m.t === "action" && m.kind === "theatre")).resolves.toBeTruthy();
    for (const space of ["theatre-6", "theatre"]) {
      s.send({ t: "enter", space, x: 0, z: 8 });
      expect(await s.seesNew((m) => m.t === "action" && m.kind === "theatre", 400)).toBe(false);
    }
  });
});
