import { afterEach, describe, expect, it } from "vitest";
import { closeAll, connect, staffMember, visitor, type Msg } from "./helpers.ts";

// The lecture theatre (server/theatre.ts, the user 11/18): only staff put a video on its big screen
// and play or move it; anyone in the theatre raises a hand (the lecturers there are told who) and
// asks in its Q&A (everyone there reads it). It lives in memory while someone is in it.

afterEach(closeAll);

const act = (kind: string) => (m: Msg) => m.t === "action" && m.kind === kind;

async function inTheatre(who: { token: string }) {
  const s = await connect(who.token);
  await s.next((m) => m.t === "welcome");
  s.send({ t: "enter", space: "theatre", x: 0, z: 8 });
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
});
