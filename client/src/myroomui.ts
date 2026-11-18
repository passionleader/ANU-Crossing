import "./calendar.css";
import "./myroomui.css";
import academic from "./academic-calendar.json";
import { mountNotePad } from "./notepad.ts";
import { FINISHES, FLOORS, FURNITURE, PIECE_INFO, WALLS, footprint, type FurnitureId, type Layout, type Piece } from "./spaces/myroom.ts";

// My Room's windows (the user, 11/18), its owner's alone: a page of Markdown notes, a personal
// calendar (with ANU's academic dates to copy in), and a furniture editor. The calendar and the
// furniture are saved on the server (server/myroom.ts: a member's in SQLite, a guest's in memory
// until they leave the room) at once. The notes are a fresh page each time (notepad.ts, as in the
// lecture theatre): Save keeps a copy in the mailbox's Saved tab, which the bookcase also opens,
// and closing with unsaved words asks first.

export interface CalEntry {
  id: string;
  date: string;
  end?: string;
  title: string;
  kind: "mine" | "teaching" | "census" | "exam" | "break" | "holiday" | "other";
}
export interface MyRoomData {
  notebook: string;
  calendar: CalEntry[];
  layout: Layout;
  guest: boolean;
}

/** A few of ANU's titles run past the 80 characters a calendar title may have: shortened, not refused. */
const short = (t: string): string => (t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t);
const ACADEMIC = (academic.events as Omit<CalEntry, "id">[]).slice().sort((a, b) => a.date.localeCompare(b.date));
const KIND_LABEL: Record<CalEntry["kind"], string> = { mine: "Mine", teaching: "Teaching", census: "Census", exam: "Exams", break: "Break", holiday: "Public holiday", other: "ANU" };
const iso = (y: number, m: number, d: number): string => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayIso = (): string => {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth(), n.getDate());
};
const touches = (e: { date: string; end?: string }, day: string): boolean => e.date === day || (!!e.end && e.date <= day && day <= e.end);

function dialog(id: string, titleText: string): { root: HTMLDivElement; card: HTMLDivElement; head: HTMLDivElement; close: HTMLButtonElement } {
  const root = document.createElement("div");
  root.id = id;
  root.className = "myroom-dialog";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", `${id}-title`);
  const card = document.createElement("div");
  card.className = "settings-card myroom-card";
  const head = document.createElement("div");
  head.className = "myroom-head";
  const h = document.createElement("h2");
  h.id = `${id}-title`;
  h.textContent = titleText;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ui-close";
  close.textContent = "Close";
  head.append(h, close);
  card.append(head);
  root.append(card);
  document.body.append(root);
  return { root, card, head, close };
}

export function mountMyRoomUi(deps: {
  /** Your room, or why it couldn't be loaded (a sentence to show). */
  load(): Promise<MyRoomData | string>;
  save(part: Partial<Pick<MyRoomData, "notebook" | "calendar" | "layout">>): Promise<string | null>;
  /** The furniture changed in the editor: shown at once, before (and whether or not) it's saved. */
  preview(layout: Layout): void;
  say(msg: string): void;
  /** Your own notes' saving and pictures (notepad.ts). */
  notes: Parameters<typeof mountNotePad>[0];
}): {
  open(what: "notebook" | "calendar" | "furniture"): Promise<void>;
  isOpen(): boolean;
  isTyping(): boolean;
  /** Closes, asking first about unsaved notes; resolves true once closed. */
  tryClose(): Promise<boolean>;
  close(): void;
} {
  let data: MyRoomData | null = null;
  const status = (el: HTMLElement, text: string): void => {
    el.textContent = text;
  };

  // --- the notes: a fresh page each time (notepad.ts) -------------------------------------
  const nb = dialog("myroom-notebook", "📓 My notes");
  nb.card.classList.add("myroom-wide");
  const pad = mountNotePad(deps.notes);
  nb.card.append(pad.el);

  // --- the calendar -------------------------------------------------------------------
  const cal = dialog("myroom-calendar", "📅 My calendar");
  const nav = document.createElement("div");
  nav.className = "cal-head";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "‹";
  prev.setAttribute("aria-label", "Previous month");
  const month = document.createElement("h3");
  month.className = "myroom-month";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Next month");
  nav.append(prev, month, next);
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  const dayHead = document.createElement("h4");
  dayHead.className = "myroom-dayhead";
  const dayList = document.createElement("ul");
  dayList.className = "cal-list";
  const add = document.createElement("form");
  add.className = "myroom-add";
  const addTitle = document.createElement("input");
  addTitle.type = "text";
  addTitle.maxLength = 80;
  addTitle.placeholder = "Add to this day: e.g. Lab report due";
  addTitle.setAttribute("aria-label", "New event's title");
  const addBtn = document.createElement("button");
  addBtn.type = "submit";
  addBtn.className = "room-primary";
  addBtn.textContent = "Add";
  add.append(addTitle, addBtn);
  const importBox = document.createElement("details");
  importBox.className = "myroom-import";
  const importSum = document.createElement("summary");
  importSum.textContent = "Copy ANU's academic dates into my calendar";
  const importList = document.createElement("div");
  importList.className = "myroom-import-list";
  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "room-primary";
  importBtn.textContent = "Copy the ticked dates";
  const importNote = document.createElement("p");
  importNote.className = "settings-note";
  importNote.textContent = "From ANU's University Calendar (2026 and 2027), as read into this app; dates can change, so check the source.";
  importBox.append(importSum, importList, importBtn, importNote);
  const calFoot = document.createElement("p");
  calFoot.className = "settings-note myroom-status";
  calFoot.setAttribute("role", "status");
  cal.card.append(nav, grid, dayHead, dayList, add, importBox, calFoot);

  const now = new Date();
  let shown = { y: now.getFullYear(), m: now.getMonth() };
  let picked = todayIso();

  function drawCalendar(): void {
    if (!data) return;
    const list = data.calendar;
    month.textContent = new Date(shown.y, shown.m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    grid.replaceChildren();
    for (const d of ["M", "T", "W", "T", "F", "S", "S"]) {
      const c = document.createElement("div");
      c.className = "cal-dow";
      c.textContent = d;
      grid.append(c);
    }
    const first = (new Date(shown.y, shown.m, 1).getDay() + 6) % 7;
    for (let i = 0; i < first; i++) grid.append(document.createElement("div"));
    const days = new Date(shown.y, shown.m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const day = iso(shown.y, shown.m, d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cal-day myroom-day";
      const on = list.filter((e) => touches(e, day));
      // Your own events first: a long exam period mustn't hide the day you wrote something on.
      const lead = on.find((e) => e.kind === "mine") ?? on.find((e) => !e.end) ?? on[0];
      if (lead) b.classList.add(`is-${lead.kind}`);
      else b.classList.add("no-event");
      // A period (an exam fortnight, a break) only tints its days, so your own events still stand out.
      if (lead?.end && lead.kind !== "mine") b.classList.add("in-span");
      if (day === todayIso()) b.classList.add("is-today");
      if (day === picked) b.classList.add("is-picked");
      b.textContent = String(d);
      b.setAttribute("aria-label", `${day}${on.length ? `, ${on.length} event${on.length > 1 ? "s" : ""}` : ""}`);
      if (on.length) {
        const dot = document.createElement("span");
        dot.className = "myroom-dot";
        dot.textContent = on.length > 1 ? String(on.length) : "";
        b.append(dot);
      }
      b.addEventListener("click", () => {
        picked = day;
        drawCalendar();
      });
      grid.append(b);
    }
    dayHead.textContent = new Date(`${picked}T00:00:00`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
    dayList.replaceChildren();
    const today = list.filter((e) => touches(e, picked));
    if (!today.length) {
      const li = document.createElement("li");
      li.className = "myroom-empty";
      li.textContent = "Nothing on this day.";
      dayList.append(li);
    }
    for (const e of today) {
      const li = document.createElement("li");
      li.className = `is-${e.kind === "mine" ? "mine" : e.kind}`;
      li.append(document.createTextNode(e.title));
      const tag = document.createElement("small");
      tag.textContent = KIND_LABEL[e.kind] + (e.end ? ` · to ${e.end.slice(5)}` : "");
      li.append(tag);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "myroom-del";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Remove "${e.title}"`);
      del.addEventListener("click", () => void saveCalendar(list.filter((x) => x.id !== e.id), "Removed."));
      li.append(del);
      dayList.append(li);
    }
  }

  async function saveCalendar(next: CalEntry[], said: string): Promise<boolean> {
    if (!data) return false;
    status(calFoot, "Saving…");
    const err = await deps.save({ calendar: next });
    if (err) {
      status(calFoot, err);
      return false;
    }
    data.calendar = next;
    status(calFoot, said);
    drawCalendar();
    return true;
  }

  function drawImport(): void {
    importList.replaceChildren();
    const have = new Set((data?.calendar ?? []).map((e) => `${e.date}|${e.title}`));
    const from = todayIso().slice(0, 7);
    for (const e of ACADEMIC) {
      if ((e.end ?? e.date).slice(0, 7) < from) continue;
      const row = document.createElement("label");
      row.className = `myroom-import-row is-${e.kind}`;
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = `${e.date}|${e.title}`;
      const already = have.has(`${e.date}|${short(e.title)}`);
      box.disabled = already;
      box.checked = false;
      const text = document.createElement("span");
      text.textContent = `${e.date.slice(5)}${e.end ? `–${e.end.slice(5)}` : ""} · ${e.title}${already ? " (in your calendar)" : ""}`;
      row.append(box, text);
      importList.append(row);
    }
  }

  prev.addEventListener("click", () => {
    shown = shown.m === 0 ? { y: shown.y - 1, m: 11 } : { y: shown.y, m: shown.m - 1 };
    drawCalendar();
  });
  next.addEventListener("click", () => {
    shown = shown.m === 11 ? { y: shown.y + 1, m: 0 } : { y: shown.y, m: shown.m + 1 };
    drawCalendar();
  });
  add.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!data) return;
    const title = addTitle.value.trim();
    if (!title) return status(calFoot, "Give it a title.");
    const entry: CalEntry = { id: crypto.randomUUID(), date: picked, title, kind: "mine" };
    void saveCalendar([...data.calendar, entry], `Added to ${picked.slice(5)}.`).then((ok) => ok && (addTitle.value = ""));
  });
  importBox.addEventListener("toggle", () => importBox.open && drawImport());
  importBtn.addEventListener("click", () => {
    if (!data) return;
    const ticked = [...importList.querySelectorAll<HTMLInputElement>("input:checked")].map((b) => b.value);
    if (!ticked.length) return status(calFoot, "Tick the dates to copy first.");
    const have = new Set(data.calendar.map((e) => `${e.date}|${e.title}`));
    const picks = ACADEMIC.filter((e) => ticked.includes(`${e.date}|${e.title}`))
      .map((e) => ({ ...e, title: short(e.title), id: crypto.randomUUID() }))
      .filter((e) => !have.has(`${e.date}|${e.title}`));
    if (!picks.length) return status(calFoot, "Those dates are in your calendar already.");
    if (data.calendar.length + picks.length > 200) return status(calFoot, `That's more than 200 dates in all: untick ${data.calendar.length + picks.length - 200} first.`);
    void saveCalendar([...data.calendar, ...picks], `Copied ${picks.length} date${picks.length > 1 ? "s" : ""} from ANU's calendar.`).then((ok) => ok && drawImport());
  });

  // --- the furniture editor ----------------------------------------------------------------
  const fe = dialog("myroom-furniture", "🪑 Arrange furniture");
  fe.root.classList.add("myroom-side");
  const feHint = document.createElement("p");
  feHint.className = "settings-note";
  feHint.textContent = "Pick a piece, then move it with the arrows (or tap the floor plan). Changes show at once; Save keeps them.";
  const plan = document.createElement("div");
  plan.className = "myroom-plan";
  plan.setAttribute("aria-label", "Floor plan: tap to move the picked piece there");
  const pieceSel = document.createElement("div");
  pieceSel.className = "myroom-pieces";
  const moveRow = document.createElement("div");
  moveRow.className = "myroom-move";
  const mk = (label: string, aria: string, f: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", f);
    return b;
  };
  const finishRow = document.createElement("div");
  finishRow.className = "myroom-swatches";
  const wallRow = document.createElement("div");
  wallRow.className = "myroom-swatches";
  const floorRow = document.createElement("div");
  floorRow.className = "myroom-swatches";
  const lab = (t: string): HTMLParagraphElement => {
    const p = document.createElement("p");
    p.className = "myroom-label";
    p.textContent = t;
    return p;
  };
  const feSave = document.createElement("button");
  feSave.type = "button";
  feSave.className = "room-primary";
  feSave.textContent = "Save the room";
  const feReset = document.createElement("button");
  feReset.type = "button";
  feReset.className = "room-secondary";
  feReset.textContent = "Undo changes";
  const feButtons = document.createElement("div");
  feButtons.className = "myroom-buttons";
  feButtons.append(feSave, feReset);
  const feFoot = document.createElement("p");
  feFoot.className = "settings-note myroom-status";
  feFoot.setAttribute("role", "status");
  fe.card.append(feHint, pieceSel, plan, moveRow, lab("Finish"), finishRow, lab("Walls"), wallRow, lab("Floor"), floorRow, feButtons, feFoot);

  let draft: Layout | null = null;
  let sel: FurnitureId = "desk";
  const HX = 6;
  const HZ = 5;
  const selPiece = (): Piece | undefined => draft?.pieces.find((p) => p.id === sel);
  const clamp = (p: Piece): void => {
    const { w, d } = footprint(p);
    p.x = Math.round(Math.max(-HX + w / 2 + 0.05, Math.min(HX - w / 2 - 0.05, p.x)) * 10) / 10;
    p.z = Math.round(Math.max(-HZ + d / 2 + 0.05, Math.min(HZ - d / 2 - 0.05 - 0.9, p.z)) * 10) / 10;
  };
  const changed = (): void => {
    if (!draft) return;
    deps.preview(draft);
    drawEditor();
    status(feFoot, "Not saved yet.");
  };
  const nudge = (dx: number, dz: number): void => {
    const p = selPiece();
    if (!p) return;
    p.x += dx;
    p.z += dz;
    clamp(p);
    changed();
  };
  moveRow.append(
    mk("◀", "Move left", () => nudge(-0.5, 0)),
    mk("▲", "Move back", () => nudge(0, -0.5)),
    mk("▼", "Move forward", () => nudge(0, 0.5)),
    mk("▶", "Move right", () => nudge(0.5, 0)),
    mk("⟳ Turn", "Turn a quarter", () => {
      const p = selPiece();
      if (!p) return;
      p.turn = (p.turn + 1) % 4;
      clamp(p);
      changed();
    }),
  );
  const toggle = mk("", "", () => {
    if (!draft) return;
    const has = draft.pieces.some((p) => p.id === sel);
    if (has) draft.pieces = draft.pieces.filter((p) => p.id !== sel);
    else {
      const p: Piece = { id: sel, x: 0, z: 0, turn: 0, finish: 0 };
      clamp(p);
      draft.pieces.push(p);
    }
    changed();
  });
  toggle.className = "myroom-toggle";
  moveRow.append(toggle);
  plan.addEventListener("click", (ev) => {
    const p = selPiece();
    if (!p) return;
    const r = plan.getBoundingClientRect();
    p.x = ((ev.clientX - r.left) / r.width) * 2 * HX - HX;
    p.z = ((ev.clientY - r.top) / r.height) * 2 * HZ - HZ;
    clamp(p);
    changed();
  });

  function drawEditor(): void {
    if (!draft) return;
    pieceSel.replaceChildren(
      ...FURNITURE.map((id) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "myroom-piece" + (id === sel ? " is-on" : "") + (draft!.pieces.some((p) => p.id === id) ? "" : " is-out");
        b.textContent = PIECE_INFO[id].label;
        b.setAttribute("aria-pressed", String(id === sel));
        b.addEventListener("click", () => {
          sel = id;
          drawEditor();
        });
        return b;
      }),
    );
    plan.replaceChildren();
    for (const p of draft.pieces) {
      const { w, d } = footprint(p);
      const el = document.createElement("div");
      el.className = "myroom-plan-piece" + (p.id === sel ? " is-on" : "");
      el.style.left = `${((p.x - w / 2 + HX) / (2 * HX)) * 100}%`;
      el.style.top = `${((p.z - d / 2 + HZ) / (2 * HZ)) * 100}%`;
      el.style.width = `${(w / (2 * HX)) * 100}%`;
      el.style.height = `${(d / (2 * HZ)) * 100}%`;
      el.style.background = `#${FINISHES[p.finish]![1].toString(16).padStart(6, "0")}`;
      el.title = PIECE_INFO[p.id].label;
      el.textContent = PIECE_INFO[p.id].label.split(" ")[0]!;
      plan.append(el);
    }
    const door = document.createElement("div");
    door.className = "myroom-plan-door";
    door.textContent = "door";
    plan.append(door);
    const p = selPiece();
    for (const b of moveRow.querySelectorAll("button")) if (b !== toggle) b.disabled = !p;
    toggle.textContent = p ? "Put it away" : "Bring it in";
    finishRow.replaceChildren(
      ...FINISHES.map(([name, main, accent], i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "myroom-swatch" + (p?.finish === i ? " is-on" : "");
        b.style.background = `linear-gradient(135deg, #${main.toString(16).padStart(6, "0")} 55%, #${accent.toString(16).padStart(6, "0")} 55%)`;
        b.title = name;
        b.setAttribute("aria-label", `${name} finish`);
        b.disabled = !p;
        b.addEventListener("click", () => {
          const q = selPiece();
          if (!q) return;
          q.finish = i;
          changed();
        });
        return b;
      }),
    );
    wallRow.replaceChildren(
      ...WALLS.map(([name, c], i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "myroom-swatch" + (draft!.wall === i ? " is-on" : "");
        b.style.background = `#${c.toString(16).padStart(6, "0")}`;
        b.title = name;
        b.setAttribute("aria-label", `${name} walls`);
        b.addEventListener("click", () => {
          draft!.wall = i;
          changed();
        });
        return b;
      }),
    );
    floorRow.replaceChildren(
      ...FLOORS.map(([name, , c], i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "myroom-swatch myroom-swatch-wide" + (draft!.floor === i ? " is-on" : "");
        b.style.background = `#${(c === 0xffffff ? 0xd9b48a : c).toString(16).padStart(6, "0")}`;
        b.textContent = name;
        b.addEventListener("click", () => {
          draft!.floor = i;
          changed();
        });
        return b;
      }),
    );
  }

  feSave.addEventListener("click", async () => {
    if (!draft || !data) return;
    status(feFoot, "Saving…");
    const err = await deps.save({ layout: draft });
    if (err) return status(feFoot, err);
    data.layout = structuredClone(draft);
    status(feFoot, data.guest ? "Saved for now (cleared when you leave)." : "Saved. Visitors see it too.");
  });
  feReset.addEventListener("click", () => {
    if (!data) return;
    draft = structuredClone(data.layout);
    deps.preview(draft);
    drawEditor();
    status(feFoot, "Back as it was.");
  });

  // --- opening and closing ----------------------------------------------------------------
  const all = [nb, cal, fe];
  let openOne: (typeof all)[number] | null = null;
  /** Closes whichever window is open; the notes, with unsaved words, ask first (and may stay). */
  async function tryClose(): Promise<boolean> {
    if (openOne === nb && !(await pad.confirmClose())) return false;
    close();
    return true;
  }
  function close(): void {
    // Leaving the editor unsaved puts the room back as it was.
    if (openOne === fe && data && draft && JSON.stringify(draft) !== JSON.stringify(data.layout)) {
      deps.preview(data.layout);
      deps.say("Furniture changes weren't saved.");
    }
    for (const d of all) d.root.hidden = true;
    openOne = null;
    document.body.classList.remove("myroom-open");
  }
  for (const d of all) {
    d.close.addEventListener("click", () => void tryClose());
    d.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void tryClose();
      }
    });
    d.root.addEventListener("click", (e) => {
      if (e.target === d.root) void tryClose();
    });
  }

  return {
    async open(what) {
      if (!(await tryClose())) return;
      if (what === "notebook") {
        // The notes need nothing from the server: a fresh page.
        pad.clear();
        openOne = nb;
        nb.root.hidden = false;
        document.body.classList.add("myroom-open");
        pad.focus();
        return;
      }
      const got = await deps.load();
      if (typeof got === "string") return deps.say(got);
      data = got;
      if (what === "calendar") {
        status(calFoot, data.guest ? "A guest's calendar is cleared when you leave your room." : "");
        drawCalendar();
        openOne = cal;
        cal.root.hidden = false;
        document.body.classList.add("myroom-open");
        addTitle.focus();
      } else {
        draft = structuredClone(data.layout);
        if (!draft.pieces.some((p) => p.id === sel)) sel = draft.pieces[0]?.id ?? "desk";
        drawEditor();
        status(feFoot, "");
        openOne = fe;
        fe.root.hidden = false;
        document.body.classList.add("myroom-open");
      }
    },
    isOpen: () => openOne !== null,
    isTyping: () => pad.isTyping(),
    tryClose,
    close() {
      // Gone without asking (signed out, sent out): the page goes.
      pad.clear();
      close();
    },
  };
}
