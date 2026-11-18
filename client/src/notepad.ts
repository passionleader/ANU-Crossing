import "./notepad.css";
import { renderMarkdown } from "./markdown.ts";

// Your own Markdown notes, in the lecture theatre's side panel and at My Room's desk (the user,
// 11/18). Nothing is kept while you write: "Save" puts a copy in your mailbox's Saved tab (and
// on My Room's bookcase), 30 days, yours only, like a meeting room's saved notes. Closing with
// unsaved words asks first: save them, throw them away, or keep writing. A picture dragged,
// pasted or added (🖼, for a phone) goes up at once, for you alone, as a line
// ![name](note-file:ID); the saved copy keeps it (server: keepNoteFiles).

const MAX = 5000;
/** How long a picture's link is trusted before asking for a fresh one. */
const LINK_MS = 3 * 60 * 1000;

export interface NotePad {
  /** The pad's element, for its window to hold. */
  el: HTMLElement;
  /** Empties it (a fresh page). */
  clear(): void;
  /** Whether there are words not saved since the last change. */
  dirty(): boolean;
  /**
   * Asks before the pad's window closes: resolves true when it may close (nothing unsaved, saved,
   * or thrown away; the pad is then empty), false to keep writing.
   */
  confirmClose(): Promise<boolean>;
  focus(): void;
  isTyping(): boolean;
}

export function mountNotePad(opts: {
  /** Signed up? A guest's notes can't be saved or hold pictures. */
  member(): boolean;
  /** Keeps a copy (the mailbox's Saved); resolves to an error message, or null. */
  save(text: string): Promise<string | null>;
  /** Uploads a picture for these notes; resolves to its id, or an error message. */
  addImage(file: File): Promise<{ id: string } | string>;
  imageLink(id: string): Promise<string | null>;
  /** What a guest is told instead of saving. */
  guestNote: string;
  placeholder: string;
  /** Side by side on a wide window (My Room), or the rendering under the box (the theatre's panel). */
  layout: "side" | "stack";
}): NotePad {
  const el = document.createElement("div");
  el.className = `notepad notepad-${opts.layout}`;
  const tools = document.createElement("div");
  tools.className = "notepad-tools";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "notepad-save";
  saveBtn.textContent = "💾 Save";
  saveBtn.title = "Keep a copy in your mailbox's Saved tab (30 days, only you)";
  const picBtn = document.createElement("button");
  picBtn.type = "button";
  picBtn.textContent = "🖼 Add picture";
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/png,image/jpeg,image/gif,image/webp";
  picker.multiple = true;
  picker.hidden = true;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "New page";
  clearBtn.title = "Start again (asks first if anything isn't saved)";
  tools.append(saveBtn, picBtn, picker, clearBtn);
  const body = document.createElement("div");
  body.className = "notepad-body";
  const text = document.createElement("textarea");
  text.maxLength = MAX;
  text.placeholder = opts.placeholder;
  text.setAttribute("aria-label", "Your notes (Markdown)");
  const view = document.createElement("div");
  view.className = "md notepad-view";
  view.setAttribute("aria-label", "Your notes, as they read");
  body.append(text, view);
  const foot = document.createElement("p");
  foot.className = "settings-note notepad-foot";
  foot.setAttribute("role", "status");
  el.append(tools, body, foot);

  // The question on closing with unsaved words: its own small popup over everything.
  const ask = document.createElement("div");
  ask.className = "notepad-ask";
  ask.hidden = true;
  const askCard = document.createElement("div");
  askCard.className = "notepad-ask-card";
  askCard.setAttribute("role", "alertdialog");
  askCard.setAttribute("aria-modal", "true");
  const askTitle = document.createElement("h2");
  askTitle.textContent = "Save your notes?";
  const askText = document.createElement("p");
  const askRow = document.createElement("div");
  askRow.className = "notepad-ask-row";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "notepad-ask-yes";
  yes.textContent = "Save";
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = "No, clear them";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Keep writing";
  askRow.append(yes, no, back);
  askCard.append(askTitle, askText, askRow);
  ask.append(askCard);
  document.body.append(ask);

  let savedText = "";
  let typing = false;
  const uploading = new Set<string>();

  // --- pictures: one link per id, so a redraw on every key never asks again -------------
  const links = new Map<string, { url: string | null; at: number }>();
  const asking = new Map<string, Promise<string | null>>();
  function resolve(id: string): Promise<string | null> {
    let p = asking.get(id);
    if (!p) {
      p = opts.imageLink(id).then(
        (url) => (links.set(id, { url, at: Date.now() }), asking.delete(id), url),
        () => (links.set(id, { url: null, at: Date.now() }), asking.delete(id), null),
      );
      asking.set(id, p);
    }
    return p;
  }
  function picture(alt: string, id: string): Node {
    const img = document.createElement("img");
    img.className = "notepad-picture";
    img.alt = alt || "picture";
    const gone = (): void => {
      const p = document.createElement("p");
      p.className = "notepad-picture-gone";
      p.textContent = `🖼 ${img.alt} (couldn't load)`;
      img.replaceWith(p);
    };
    const hit = links.get(id);
    if (hit && Date.now() - hit.at < LINK_MS) {
      if (hit.url) img.src = hit.url;
      else return (gone(), document.createTextNode(`🖼 ${img.alt} (couldn't load)`));
    } else void resolve(id).then((url) => (url ? (img.src = url) : gone()));
    return img;
  }

  function render(): void {
    const frag = renderMarkdown(text.value || "*Nothing yet.*", { headings: 5, topLevel: 1, rich: true, picture });
    view.replaceChildren(frag);
    for (const name of uploading) {
      const p = document.createElement("p");
      p.className = "notepad-uploading";
      p.textContent = `🖼 ${name}: uploading…`;
      view.append(p);
    }
  }
  const dirty = (): boolean => text.value.trim() !== "" && text.value !== savedText;
  function status(): void {
    if (!opts.member()) foot.textContent = opts.guestNote;
    else if (!text.value.trim()) foot.textContent = "Not kept until you press Save. Closing clears the page.";
    else foot.textContent = dirty() ? `Not saved yet · ${text.value.length}/${MAX}` : `Saved to your mailbox · ${text.value.length}/${MAX}`;
  }
  text.addEventListener("input", () => {
    render();
    status();
  });
  text.addEventListener("focus", () => (typing = true));
  text.addEventListener("blur", () => (typing = false));

  async function save(): Promise<boolean> {
    if (!opts.member()) {
      foot.textContent = opts.guestNote;
      return false;
    }
    const value = text.value;
    if (!value.trim()) {
      foot.textContent = "There's nothing to save yet.";
      return false;
    }
    if (uploading.size) {
      foot.textContent = "Wait for the picture to finish uploading.";
      return false;
    }
    saveBtn.disabled = true;
    foot.textContent = "Saving…";
    const err = await opts.save(value);
    saveBtn.disabled = false;
    if (err) {
      foot.textContent = err;
      return false;
    }
    savedText = value;
    foot.textContent = "Saved: it's in your mailbox's Saved tab (and on My Room's bookcase) for 30 days.";
    return true;
  }
  saveBtn.addEventListener("click", () => void save());

  async function addImages(files: File[]): Promise<void> {
    if (!opts.member()) {
      foot.textContent = opts.guestNote;
      return;
    }
    for (const f of files.filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type) || /\.(png|jpe?g|gif|webp)$/i.test(f.name))) {
      const name = f.name.replace(/[[\]()\n]/g, "") || "picture";
      const at = text.selectionStart ?? text.value.length;
      uploading.add(name);
      render();
      foot.textContent = `Uploading ${name}…`;
      const r = await opts.addImage(f);
      uploading.delete(name);
      if (typeof r === "string") {
        render();
        foot.textContent = r;
        continue;
      }
      const v = text.value;
      const before = v.slice(0, Math.min(at, v.length));
      const after = v.slice(Math.min(at, v.length));
      const line = `![${name}](note-file:${r.id})`;
      text.value = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${line}\n${after}`.slice(0, MAX);
      render();
      status();
    }
  }
  picBtn.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    const files = [...(picker.files ?? [])];
    picker.value = "";
    void addImages(files);
  });
  for (const zone of [text, view] as HTMLElement[]) {
    zone.addEventListener("dragover", (e) => {
      if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) {
        e.preventDefault();
        el.classList.add("is-drop");
      }
    });
    zone.addEventListener("dragleave", () => el.classList.remove("is-drop"));
    zone.addEventListener("drop", (e) => {
      el.classList.remove("is-drop");
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      void addImages(files);
    });
  }
  text.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.some((f) => /^image\//.test(f.type))) return;
    e.preventDefault();
    void addImages(files);
  });

  /** Whether you're signed up can change after this was made (signing in): asked each time it shows. */
  function refresh(): void {
    picBtn.hidden = saveBtn.hidden = !opts.member();
    status();
  }
  function clear(): void {
    text.value = "";
    savedText = "";
    uploading.clear();
    render();
    refresh();
  }

  /** The popup: resolves "save" | "clear" | "back". */
  function question(): Promise<"save" | "clear" | "back"> {
    const member = opts.member();
    askText.textContent = member
      ? "These notes aren't saved. Closing clears them. Save a copy to your mailbox first?"
      : `${opts.guestNote} Closing clears these notes.`;
    yes.hidden = !member;
    ask.hidden = false;
    (member ? yes : no).focus();
    return new Promise((done) => {
      const finish = (a: "save" | "clear" | "back"): void => {
        ask.hidden = true;
        yes.onclick = no.onclick = back.onclick = null;
        ask.onkeydown = null;
        done(a);
      };
      yes.onclick = () => finish("save");
      no.onclick = () => finish("clear");
      back.onclick = () => finish("back");
      ask.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Escape") finish("back");
      };
    });
  }
  async function confirmClose(): Promise<boolean> {
    if (!ask.hidden) return false;
    if (!dirty()) {
      clear();
      return true;
    }
    const a = await question();
    if (a === "back") {
      text.focus();
      return false;
    }
    if (a === "save" && !(await save())) return false;
    clear();
    return true;
  }
  clearBtn.addEventListener("click", () => {
    void (async () => {
      if (!dirty()) return clear();
      const a = await question();
      if (a === "back") return;
      if (a === "save" && !(await save())) return;
      clear();
    })();
  });

  clear();
  return {
    el,
    clear,
    dirty,
    confirmClose,
    focus: () => {
      refresh();
      text.focus();
    },
    isTyping: () => typing || !ask.hidden,
  };
}
