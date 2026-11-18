import "./theatreui.css";
import * as THREE from "three";
import { renderMarkdown } from "./markdown.ts";
import { mountRoomScreen, type VideoView } from "./roomscreen.ts";
import { SCREEN } from "./spaces/theatre.ts";

// The lecture theatre's screen and buttons (the user, 11/18). The lecturer's video (server/theatre.ts)
// plays in a player laid over the 3D screen, kept on it as the camera moves; "Big view" makes it fill
// the window. "Notes" opens your My Room notebook on the right (a guest's stay in this browser), "Ask" the
// theatre's Q&A (everyone there reads it, the lecturer too), and "Raise hand" tells the lecturers
// who. Staff also get the list of raised hands and, anywhere in the theatre ("Screen", or E at the
// lectern), the link box and play, pause and skip, which everyone follows.
// The player sits under the 3D view and the screen is a hole onto it (spaces/theatre.ts), so it lies
// flat on the wall in perspective and people standing in front of it stay in front of it.

export interface Question {
  name: string;
  text: string;
  at: number;
}

const NOTES_KEY = "campus.theatre-notes";
/** The player's size in device pixels away from Big view: 480p, so YouTube and Vimeo stay under 720p. */
const PLAYER_W = 854;
const PLAYER_H = 480;

/**
 * The CSS matrix3d that draws a w x h box onto four points on the page (top-left, top-right,
 * bottom-right, bottom-left, as x,y pairs): the square-to-quad projection (Heckbert), scaled to
 * the box. Null if the points are degenerate.
 */
export function quadTransform(w: number, h: number, q: number[]): string | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / det;
  const k = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  // Column-major, with u = x / w and v = y / h folded in.
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return m.every(Number.isFinite) ? `matrix3d(${m.map((n) => +n.toFixed(8)).join(",")})` : null;
}

export function mountTheatreUi(deps: {
  send(msg: Record<string, unknown>): boolean;
  /** Whether you're staff (or the admin), so the lecturer's controls show. */
  isStaff(): boolean;
  me(): string;
  say(msg: string): void;
  notSent(): void;
  /** Turns the 3D screen into a hole onto the player (true) or back to its idle card. */
  screenHole(on: boolean): void;
  /** Your My Room notebook, for a member (null: a guest, whose notes stay in this browser). */
  notebook(): { load(): Promise<string>; save(text: string): Promise<string | null> } | null;
}): {
  /** You came in (true) or left (false). */
  shown(on: boolean): void;
  /** Each frame: keeps the player over the screen. */
  frame(camera: THREE.Camera, canvas: HTMLElement): void;
  theatre(state: { video: VideoView | null; hands: string[]; questions: Question[] }): void;
  video(v: VideoView | null): void;
  refused(reason: string, v: VideoView | null): void;
  hands(names: string[]): void;
  handUp(name: string): void;
  ask(q: Question, staff: boolean): void;
  isTyping(): boolean;
  /** E at the lectern: staff get the screen's controls; anyone else is told they can't. */
  lectern(): void;
} {
  // --- the player over the screen ------------------------------------------------------
  const screen = mountRoomScreen({
    send: (op, extra) => deps.send({ t: "action", kind: "theatre", what: "video", op, ...extra }),
    onShare: () => undefined,
    onNotSent: deps.notSent,
    onStuck: (on) => void (startHint.hidden = !on),
  });
  const frameEl = document.createElement("div");
  frameEl.id = "theatre-screen";
  frameEl.hidden = true;
  frameEl.append(screen.el);
  const bigClose = document.createElement("button");
  bigClose.type = "button";
  bigClose.className = "theatre-big-close";
  bigClose.textContent = "✕ Back to the theatre";
  bigClose.hidden = true;
  frameEl.append(bigClose);
  // A browser plays a video with sound only after a first click on the page; until then, say so.
  const startHint = document.createElement("p");
  startHint.className = "theatre-start-hint";
  startHint.textContent = "▶ Click anywhere once to join in";
  startHint.hidden = true;
  frameEl.append(startHint);
  document.body.append(frameEl);

  // --- the buttons -----------------------------------------------------------------------
  const bar = document.createElement("div");
  bar.id = "theatre-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Lecture theatre");
  const btn = (label: string, title: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    bar.append(b);
    return b;
  };
  const bigBtn = btn("⛶ Big view", "Watch the screen full size");
  const notesBtn = btn("📝 Notes", "Your own notes beside the lecture (your My Room notebook)");
  const askBtn = btn("💬 Ask", "The theatre's Q&A: ask the lecturer (everyone here reads it)");
  const handBtn = btn("✋ Raise hand", "Tell the lecturer you have a question");
  // Staff run the screen from anywhere in the theatre (the user, 11/18), here or E at the lectern.
  const screenBtn = btn("📺 Screen", "Put a video on the big screen, play, pause or skip it");
  screenBtn.hidden = true;
  const handsBadge = document.createElement("span");
  handsBadge.className = "theatre-count";
  handsBadge.hidden = true;
  askBtn.append(handsBadge);
  document.body.append(bar);

  // --- the side panel: notes or Q&A ------------------------------------------------------------
  const side = document.createElement("aside");
  side.id = "theatre-side";
  side.hidden = true;
  const sideHead = document.createElement("div");
  sideHead.className = "theatre-side-head";
  const sideTitle = document.createElement("h2");
  const sideClose = document.createElement("button");
  sideClose.type = "button";
  sideClose.className = "ui-close";
  sideClose.textContent = "Close";
  sideHead.append(sideTitle, sideClose);
  // Notes: Markdown, rendered under the box as you type, kept in this browser only.
  const notes = document.createElement("div");
  notes.className = "theatre-notes";
  const notesText = document.createElement("textarea");
  notesText.maxLength = 5000;
  notesText.placeholder = "Notes for this lecture (Markdown).\n# Topic\n- point";
  notesText.setAttribute("aria-label", "Your notes (Markdown)");
  const notesView = document.createElement("div");
  notesView.className = "md theatre-notes-view";
  const notesFoot = document.createElement("p");
  notesFoot.className = "settings-note";
  notesFoot.textContent = "";
  notes.append(notesText, notesView, notesFoot);
  // Q&A: the questions so far, a box to ask, and (for staff) the raised hands.
  const qa = document.createElement("div");
  qa.className = "theatre-qa";
  const handsBox = document.createElement("div");
  handsBox.className = "theatre-hands";
  handsBox.hidden = true;
  const qList = document.createElement("div");
  qList.className = "theatre-qlist";
  qList.setAttribute("role", "log");
  qList.setAttribute("aria-live", "polite");
  qList.dataset.empty = "No questions yet. Ask here: the lecturer and everyone in the theatre read it.";
  const askForm = document.createElement("form");
  askForm.className = "theatre-ask";
  const askInput = document.createElement("input");
  askInput.type = "text";
  askInput.maxLength = 300;
  askInput.placeholder = "Ask the lecturer…";
  askInput.setAttribute("aria-label", "Your question");
  const askSend = document.createElement("button");
  askSend.type = "submit";
  askSend.className = "room-primary";
  askSend.textContent = "Send";
  askForm.append(askInput, askSend);
  qa.append(handsBox, qList, askForm);
  // The lecturer's screen controls: the player's own link box and stop button, moved here.
  const lect = document.createElement("div");
  lect.className = "theatre-lect";
  const lectHelp = document.createElement("p");
  lectHelp.className = "settings-note";
  lectHelp.textContent = "Paste a YouTube or Vimeo link: it plays on the big screen for everyone here. Play, pause and skip with the buttons above (or the player itself in Big view); everyone follows you. Only staff can do this.";
  const form = screen.el.querySelector<HTMLFormElement>(".rs-form");
  const buttons = screen.el.querySelector<HTMLElement>(".rs-buttons");
  const lectStatus = screen.el.querySelector<HTMLElement>(".rs-status");
  if (form) lect.append(form);
  if (lectStatus) lect.append(lectStatus);
  // Play, pause and skip for everyone: the player itself sits under the 3D view, out of reach of a click.
  const ctl = document.createElement("div");
  ctl.className = "theatre-ctl";
  const ctlBtn = (label: string, title: string, run: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", run);
    ctl.append(b);
    return b;
  };
  const op = (name: string, pos: number): void => {
    if (!deps.send({ t: "action", kind: "theatre", what: "video", op: name, pos: Math.max(0, pos) })) deps.notSent();
  };
  ctlBtn("⏪ 10 s", "Back ten seconds, for everyone", () => {
    const w = screen.where();
    if (w) op("seek", w.pos - 10);
  });
  const playBtn = ctlBtn("▶ Play", "Play or pause, for everyone", () => {
    const w = screen.where();
    if (w) op(w.playing ? "pause" : "play", w.pos);
  });
  ctlBtn("10 s ⏩", "On ten seconds, for everyone", () => {
    const w = screen.where();
    if (w) op("seek", w.pos + 10);
  });
  ctl.hidden = true;
  lect.append(ctl);
  if (buttons) lect.append(buttons);
  lect.append(lectHelp);
  side.append(sideHead, notes, qa, lect);
  document.body.append(side);

  let inside = false;
  let big = false;
  let panel: "notes" | "qa" | "screen" | null = null;
  let myHand = false;
  let hands: string[] = [];
  let unread = 0;
  let hasVideo = false;

  // A member's notes are their My Room notebook (the user, 11/18: notes from a lecture end up in
  // your room), saved a moment after typing stops; a guest's stay in this browser, as before.
  const renderNotes = (): void => void notesView.replaceChildren(renderMarkdown(notesText.value || "*Nothing yet.*"));
  let saved = "";
  let saveTimer = 0;
  let loaded = false;
  async function loadNotes(): Promise<void> {
    const nb = deps.notebook();
    if (!nb) {
      try {
        notesText.value = localStorage.getItem(NOTES_KEY) ?? "";
      } catch {
        // No storage: the notes still work for this visit.
      }
      notesFoot.textContent = "Kept in this browser only; nobody else sees them. Sign up to keep them in My Room.";
      loaded = true;
      return renderNotes();
    }
    notesText.disabled = true;
    notesFoot.textContent = "Opening your notebook…";
    try {
      saved = notesText.value = await nb.load();
      notesFoot.textContent = "Your My Room notebook: saved as you type, only you see it.";
      loaded = true;
    } catch {
      notesFoot.textContent = "Your notebook couldn't be opened. Close and try again.";
    }
    notesText.disabled = !loaded;
    renderNotes();
  }
  async function saveNotes(): Promise<void> {
    window.clearTimeout(saveTimer);
    const nb = deps.notebook();
    if (!nb || !loaded || notesText.value === saved) return;
    const text = notesText.value;
    notesFoot.textContent = "Saving…";
    const err = await nb.save(text);
    if (err) {
      notesFoot.textContent = err;
      return;
    }
    saved = text;
    notesFoot.textContent = `Saved to your My Room notebook · ${text.length}/5000`;
  }
  notesText.addEventListener("input", () => {
    renderNotes();
    if (!deps.notebook()) {
      try {
        localStorage.setItem(NOTES_KEY, notesText.value);
      } catch {
        // Kept for this visit only.
      }
      return;
    }
    notesFoot.textContent = "…";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveNotes(), 900);
  });
  notesText.addEventListener("blur", () => void saveNotes());

  function setBig(on: boolean): void {
    big = on && hasVideo;
    frameEl.classList.toggle("is-big", big);
    bigClose.hidden = !big;
    bigBtn.setAttribute("aria-pressed", String(big));
    document.body.classList.toggle("theatre-big", big);
  }
  function setPanel(next: "notes" | "qa" | "screen" | null): void {
    if (panel === "notes" && next !== "notes") void saveNotes();
    panel = next;
    side.hidden = !next;
    notes.hidden = next !== "notes";
    qa.hidden = next !== "qa";
    lect.hidden = next !== "screen";
    sideTitle.textContent = next === "notes" ? "📓 My notebook" : next === "screen" ? "📺 The big screen" : "💬 Q&A";
    screenBtn.setAttribute("aria-pressed", String(next === "screen"));
    notesBtn.setAttribute("aria-pressed", String(next === "notes"));
    askBtn.setAttribute("aria-pressed", String(next === "qa"));
    if (next === "screen") form?.querySelector("input")?.focus();
    document.body.classList.toggle("theatre-side-open", !!next);
    if (next === "notes") {
      // Fresh from the server each time (you may have written in My Room since).
      loaded = false;
      void loadNotes().then(() => {
        if (panel === "notes") notesText.focus();
      });
    }
    if (next === "qa") {
      unread = 0;
      drawBadge();
      qList.scrollTop = qList.scrollHeight;
      askInput.focus();
    }
  }
  function drawBadge(): void {
    const n = unread + (deps.isStaff() ? hands.length : 0);
    handsBadge.hidden = n === 0;
    handsBadge.textContent = String(n);
  }
  function drawHands(): void {
    myHand = hands.some((h) => h.toLowerCase() === deps.me().toLowerCase());
    handBtn.textContent = myHand ? "✋ Lower hand" : "✋ Raise hand";
    handBtn.classList.toggle("is-on", myHand);
    handsBox.hidden = !deps.isStaff();
    handsBox.replaceChildren();
    if (deps.isStaff()) {
      const h = document.createElement("p");
      h.className = "theatre-hands-title";
      h.textContent = hands.length ? `Hands up (${hands.length}), in the order raised:` : "No hands up.";
      handsBox.append(h);
      for (const name of hands) {
        const row = document.createElement("div");
        row.className = "theatre-hand";
        row.append(document.createTextNode(`✋ ${name}`));
        const done = document.createElement("button");
        done.type = "button";
        done.textContent = "Answered";
        done.addEventListener("click", () => deps.send({ t: "action", kind: "theatre", what: "lower", name }) || deps.notSent());
        row.append(done);
        handsBox.append(row);
      }
    }
    drawBadge();
  }
  function addQuestion(q: Question, staff: boolean): void {
    const el = document.createElement("div");
    el.className = "theatre-q" + (q.name.toLowerCase() === deps.me().toLowerCase() ? " is-mine" : "") + (staff ? " is-staff" : "");
    const who = document.createElement("b");
    who.textContent = staff ? `${q.name} · lecturer` : q.name;
    const when = document.createElement("small");
    when.textContent = new Date(q.at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
    who.append(" ", when);
    el.append(who, document.createTextNode(q.text));
    const stick = qList.scrollHeight - qList.scrollTop - qList.clientHeight < 30;
    qList.append(el);
    if (stick) qList.scrollTop = qList.scrollHeight;
  }

  bigBtn.addEventListener("click", () => (hasVideo ? setBig(!big) : deps.say("Nothing on the screen yet: the lecturer puts the video on.")));
  bigClose.addEventListener("click", () => setBig(false));
  notesBtn.addEventListener("click", () => setPanel(panel === "notes" ? null : "notes"));
  screenBtn.addEventListener("click", () => setPanel(panel === "screen" ? null : "screen"));
  // The player is under the 3D view, where a click can't reach it: a browser that waits for a click
  // before playing (startHint) starts on any click or key on the page.
  const nudge = (): void => {
    if (inside && hasVideo) screen.nudge();
  };
  window.addEventListener("pointerdown", nudge, true);
  window.addEventListener("keydown", nudge, true);
  askBtn.addEventListener("click", () => setPanel(panel === "qa" ? null : "qa"));
  sideClose.addEventListener("click", () => setPanel(null));
  handBtn.addEventListener("click", () => {
    if (!deps.send({ t: "action", kind: "theatre", what: "hand", up: !myHand })) deps.notSent();
  });
  askForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = askInput.value.trim();
    if (!text) return;
    if (!deps.send({ t: "action", kind: "theatre", what: "ask", text })) return deps.notSent();
    askInput.value = "";
  });
  for (const el of [side, frameEl])
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (big) setBig(false);
      else setPanel(null);
    });

  // Where the screen's four corners land on the page (the player follows the camera).
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  return {
    shown(on) {
      inside = on;
      bar.hidden = !on;
      frameEl.hidden = !on;
      frameEl.classList.toggle("is-lecturer", deps.isStaff());
      handBtn.hidden = deps.isStaff();
      screenBtn.hidden = !deps.isStaff();
      screen.shown(on);
      if (!on) {
        setBig(false);
        setPanel(null);
        screen.reset();
        qList.replaceChildren();
        hands = [];
        unread = 0;
        hasVideo = false;
        frameEl.classList.remove("has-video");
        deps.screenHole(false);
        document.body.classList.remove("theatre-hole");
      }
      drawHands();
    },
    frame(camera, canvas) {
      if (!inside || big) return;
      const r = canvas.getBoundingClientRect();
      const hw = SCREEN.w / 2;
      const hh = SCREEN.h / 2;
      // Top-left, top-right, bottom-right, bottom-left: the order quadTransform wants.
      corners[0]!.set(SCREEN.x - hw, SCREEN.y + hh, SCREEN.z);
      corners[1]!.set(SCREEN.x + hw, SCREEN.y + hh, SCREEN.z);
      corners[2]!.set(SCREEN.x + hw, SCREEN.y - hh, SCREEN.z);
      corners[3]!.set(SCREEN.x - hw, SCREEN.y - hh, SCREEN.z);
      const pts: number[] = [];
      for (const c of corners) {
        const p = c.clone().project(camera);
        // A corner behind the camera can't be drawn in perspective: hide the player until it's back.
        if (p.z > 1) return void (frameEl.style.visibility = "hidden");
        pts.push(r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height);
      }
      // The player is laid out small (under 720p: the sites pick their quality from its size, the
      // user 11/18) and drawn onto the screen's four corners, so it sits flat on the wall and leans
      // as you look from the side, instead of a rectangle floating in front of it.
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(PLAYER_W / dpr);
      const h = Math.round(PLAYER_H / dpr);
      const m = quadTransform(w, h, pts);
      const s = frameEl.style;
      s.visibility = m ? "" : "hidden";
      s.left = "0px";
      s.top = "0px";
      s.width = `${w}px`;
      s.height = `${h}px`;
      if (m) s.transform = m;
    },
    theatre(st) {
      qList.replaceChildren();
      for (const q of st.questions) addQuestion(q, false);
      hands = st.hands;
      drawHands();
      this.video(st.video);
    },
    video(v) {
      hasVideo = !!v;
      frameEl.classList.toggle("has-video", hasVideo);
      deps.screenHole(hasVideo);
      document.body.classList.toggle("theatre-hole", hasVideo);
      ctl.hidden = !v;
      playBtn.textContent = v?.playing ? "⏸ Pause" : "▶ Play";
      screen.video(v);
      if (!v) setBig(false);
    },
    refused(reason, v) {
      screen.video(v);
      if (reason === "staff only") deps.say("You don't have permission to play videos: only staff run the screen.");
      else if (reason === "link") screen.note("Only YouTube and Vimeo links (https) can be shown.");
      else if (reason === "slow down") deps.say("One at a time, please.");
      else if (reason === "too long") deps.say("Keep a question under 300 characters.");
    },
    hands(names) {
      hands = names;
      drawHands();
    },
    handUp(name) {
      // A lecturer is told the moment a hand goes up.
      if (deps.isStaff()) deps.say(`✋ ${name} raised a hand`);
    },
    ask(q, staff) {
      addQuestion(q, staff);
      if (panel !== "qa" && q.name.toLowerCase() !== deps.me().toLowerCase()) {
        unread++;
        drawBadge();
      }
    },
    isTyping: () => inside && (!!panel || big),
    lectern() {
      if (!inside) return;
      if (!deps.isStaff()) return deps.say("You don't have permission to play videos: only staff run the screen.");
      setPanel(panel === "screen" ? null : "screen");
    },
  };
}
