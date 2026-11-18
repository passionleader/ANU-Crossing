import "./theatreui.css";
import * as THREE from "three";
import { renderMarkdown } from "./markdown.ts";
import { mountRoomScreen, type VideoView } from "./roomscreen.ts";
import { SCREEN } from "./spaces/theatre.ts";

// The lecture theatre's screen and buttons (the user, 11/18). The lecturer's video (server/theatre.ts)
// plays in a player laid over the 3D screen, kept on it as the camera moves; "Big view" makes it fill
// the window. "Notes" opens a Markdown notepad on the right (kept in this browser), "Ask" the
// theatre's Q&A (everyone there reads it, the lecturer too), and "Raise hand" tells the lecturers
// who. Staff also get the link box, play/pause through the player, and the list of raised hands.

export interface Question {
  name: string;
  text: string;
  at: number;
}

const NOTES_KEY = "campus.theatre-notes";

export function mountTheatreUi(deps: {
  send(msg: Record<string, unknown>): boolean;
  /** Whether you're staff (or the admin), so the lecturer's controls show. */
  isStaff(): boolean;
  me(): string;
  say(msg: string): void;
  notSent(): void;
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
  startHint.textContent = "▶ Click the video once to join in";
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
  const notesBtn = btn("📝 Notes", "Your own notes beside the lecture (kept in this browser)");
  const askBtn = btn("💬 Ask", "The theatre's Q&A: ask the lecturer (everyone here reads it)");
  const handBtn = btn("✋ Raise hand", "Tell the lecturer you have a question");
  // Staff only: the screen's controls (a link to show, stop it for everyone), in the side panel.
  const screenBtn = btn("📺 Screen", "Put a YouTube or Vimeo video on the big screen");
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
  notesFoot.textContent = "Kept in this browser only; nobody else sees them.";
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
  lectHelp.textContent = "Paste a YouTube or Vimeo link: it plays on the big screen for everyone here. Play, pause and skip with the player on the screen; everyone follows you. Only staff can do this.";
  const form = screen.el.querySelector<HTMLFormElement>(".rs-form");
  const buttons = screen.el.querySelector<HTMLElement>(".rs-buttons");
  const lectStatus = screen.el.querySelector<HTMLElement>(".rs-status");
  if (form) lect.append(form);
  if (lectStatus) lect.append(lectStatus);
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

  try {
    notesText.value = localStorage.getItem(NOTES_KEY) ?? "";
  } catch {
    // No storage: the notes still work for this visit.
  }
  const renderNotes = (): void => void notesView.replaceChildren(renderMarkdown(notesText.value || "*Nothing yet.*"));
  notesText.addEventListener("input", () => {
    renderNotes();
    try {
      localStorage.setItem(NOTES_KEY, notesText.value);
    } catch {
      // Kept for this visit only.
    }
  });

  function setBig(on: boolean): void {
    big = on && hasVideo;
    frameEl.classList.toggle("is-big", big);
    bigClose.hidden = !big;
    bigBtn.setAttribute("aria-pressed", String(big));
    document.body.classList.toggle("theatre-big", big);
  }
  function setPanel(next: "notes" | "qa" | "screen" | null): void {
    panel = next;
    side.hidden = !next;
    notes.hidden = next !== "notes";
    qa.hidden = next !== "qa";
    lect.hidden = next !== "screen";
    sideTitle.textContent = next === "notes" ? "📝 My notes" : next === "screen" ? "📺 The big screen" : "💬 Q&A";
    notesBtn.setAttribute("aria-pressed", String(next === "notes"));
    askBtn.setAttribute("aria-pressed", String(next === "qa"));
    screenBtn.setAttribute("aria-pressed", String(next === "screen"));
    if (next === "screen") form?.querySelector("input")?.focus();
    document.body.classList.toggle("theatre-side-open", !!next);
    if (next === "notes") {
      renderNotes();
      notesText.focus();
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
  askBtn.addEventListener("click", () => setPanel(panel === "qa" ? null : "qa"));
  sideClose.addEventListener("click", () => setPanel(null));
  screenBtn.addEventListener("click", () => setPanel(panel === "screen" ? null : "screen"));
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
      screenBtn.hidden = !deps.isStaff();
      handBtn.hidden = deps.isStaff();
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
      }
      drawHands();
    },
    frame(camera, canvas) {
      if (!inside || big) return;
      const r = canvas.getBoundingClientRect();
      const hw = SCREEN.w / 2;
      const hh = SCREEN.h / 2;
      corners[0]!.set(SCREEN.x - hw, SCREEN.y + hh, SCREEN.z);
      corners[1]!.set(SCREEN.x + hw, SCREEN.y + hh, SCREEN.z);
      corners[2]!.set(SCREEN.x - hw, SCREEN.y - hh, SCREEN.z);
      corners[3]!.set(SCREEN.x + hw, SCREEN.y - hh, SCREEN.z);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(camera);
        const x = r.left + ((p.x + 1) / 2) * r.width;
        const y = r.top + ((1 - p.y) / 2) * r.height;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const s = frameEl.style;
      s.left = `${Math.round(minX)}px`;
      s.top = `${Math.round(minY)}px`;
      s.width = `${Math.round(maxX - minX)}px`;
      s.height = `${Math.round(maxY - minY)}px`;
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
      screen.video(v);
      if (!v) setBig(false);
    },
    refused(reason, v) {
      screen.video(v);
      if (reason === "staff only") screen.note("Only the lecturer controls the screen; it keeps in step with theirs.");
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
  };
}
