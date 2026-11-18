import { VIDEO_GAP_MS, applyVideo, videoView, type VideoState } from "./video.ts";

// The lecture theatre's cinema rooms (the user, 11/18; five of them, "theatre-1" to "theatre-5", one
// of these each, spaces.ts): a tiered room of 50 seats facing one big screen, reached
// by the passage under the north row (client/src/spaces/theatre.ts). Staff (the admin included)
// lecture: only they put a YouTube or Vimeo video on the screen and play, pause or move it. Everyone
// else in the theatre watches in step, may raise a hand (the lecturers there are told at once, with
// who) and may ask a question in the theatre's Q&A, which everyone there reads. All of it lives in
// server memory while someone is in the theatre and goes when it empties, like a meeting room's.
//
// This holds the rules; realtime.ts passes it the people and a way to tell them things, so the
// real-time layer stays generic ("action" with a kind).

export const THEATRE_SEATS = 50;
/** A question's longest text, and how often one person may ask. */
export const ASK_MAX = 300;
export const ASK_GAP_MS = 5000;
/** Questions kept for the people coming in late. */
const KEEP = 60;

export interface TheatrePerson {
  name: string;
  staff: boolean;
}
export interface TheatreDeps {
  /** Who is in the theatre right now. */
  people(): TheatrePerson[];
  /** Tells one person something. */
  tell(name: string, msg: Record<string, unknown>): void;
  log(event: "refused" | "video-set", name: string, data: Record<string, unknown>): void;
}

interface Question {
  name: string;
  text: string;
  at: number;
}

export function createTheatre(deps: TheatreDeps) {
  let video: VideoState | undefined;
  const hands = new Map<string, { name: string; at: number }>(); // by lower-case name
  let questions: Question[] = [];
  const lastAct = new Map<string, number>();
  const lastAsk = new Map<string, number>();

  const everyone = (msg: Record<string, unknown>): void => {
    for (const p of deps.people()) deps.tell(p.name, msg);
  };
  const lecturers = (msg: Record<string, unknown>): void => {
    for (const p of deps.people()) if (p.staff) deps.tell(p.name, msg);
  };
  const handList = (): { name: string; at: number }[] => [...hands.values()].sort((a, b) => a.at - b.at);
  const view = (now = Date.now()) => ({ video: videoView(video, now), hands: handList().map((h) => h.name), questions });

  return {
    /** Someone came in: how the theatre stands (the video where it is now, hands up, the questions so far). */
    joined(name: string): void {
      deps.tell(name, { t: "action", kind: "theatre", ...view() });
    },
    /** Someone left: their hand goes down; the last one out clears everything. */
    left(name: string): void {
      if (hands.delete(name.toLowerCase())) everyone({ t: "action", kind: "theatre-hands", hands: handList().map((h) => h.name) });
      if (deps.people().length === 0) {
        video = undefined;
        hands.clear();
        questions = [];
      }
    },
    /** One request from someone in the theatre: "video" (staff only), "hand" or "ask". */
    action(who: TheatrePerson, msg: Record<string, unknown>): void {
      const key = who.name.toLowerCase();
      const now = Date.now();
      const refuse = (reason: string): void => deps.tell(who.name, { t: "action", kind: "theatre-refused", reason, video: videoView(video, now) });
      if (msg.what === "video") {
        if (!who.staff) {
          deps.log("refused", who.name, { action: "theatre-video", reason: "not staff" });
          return refuse("staff only");
        }
        if (now - (lastAct.get(key) ?? 0) < VIDEO_GAP_MS) return refuse("slow down");
        const done = applyVideo(video, who.name, msg, now);
        if (!done.ok) return refuse(done.reason);
        lastAct.set(key, now);
        video = done.state;
        if (done.what) deps.log("video-set", who.name, { op: msg.op, ...(video ? { provider: video.provider } : {}) });
        everyone({ t: "action", kind: "theatre-video", video: videoView(video, now) });
        return;
      }
      if (msg.what === "hand") {
        const up = msg.up === true;
        if (up === hands.has(key)) return;
        if (up) hands.set(key, { name: who.name, at: now });
        else hands.delete(key);
        everyone({ t: "action", kind: "theatre-hands", hands: handList().map((h) => h.name) });
        // The lecturers are told who, the moment a hand goes up.
        if (up) lecturers({ t: "action", kind: "theatre-hand-up", name: who.name });
        return;
      }
      if (msg.what === "lower" && who.staff && typeof msg.name === "string") {
        // A lecturer answers someone and puts their hand down.
        if (hands.delete(msg.name.toLowerCase())) everyone({ t: "action", kind: "theatre-hands", hands: handList().map((h) => h.name) });
        return;
      }
      if (msg.what === "ask") {
        const text = typeof msg.text === "string" ? msg.text.trim().replace(/\s+/g, " ") : "";
        if (!text) return refuse("empty");
        if (text.length > ASK_MAX) return refuse("too long");
        if (now - (lastAsk.get(key) ?? 0) < ASK_GAP_MS) return refuse("slow down");
        lastAsk.set(key, now);
        const q = { name: who.name, text, at: now };
        questions.push(q);
        if (questions.length > KEEP) questions.shift();
        everyone({ t: "action", kind: "theatre-ask", question: q, staff: who.staff });
        return;
      }
      refuse("what");
    },
  };
}
