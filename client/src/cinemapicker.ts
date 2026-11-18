// Choosing a cinema room: the passage to the lecture theatre opens this list (the user, 11/18), five
// rooms the same as each other, each with its own screen, hands and questions (server/theatre.ts).
// Like the classroom picker (and in its style, classpicker.css), a row only selects; "Enter" (the
// button, the Enter key or a double click) goes in, so a stray tap can't send you anywhere.

import "./classpicker.css";

export interface CinemaItem {
  n: number;
  space: string;
  /** How many are in it now. */
  online: number;
}

export function mountCinemaPicker(pick: (item: CinemaItem) => void): {
  open(list: CinemaItem[]): void;
  update(list: CinemaItem[]): void;
  close(): void;
  isOpen(): boolean;
} {
  const root = document.createElement("div");
  root.id = "cinema-picker";
  root.hidden = true;
  root.dataset.keep = "";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "cinema-picker-title");
  const card = document.createElement("div");
  card.className = "class-card";
  const title = document.createElement("h2");
  title.id = "cinema-picker-title";
  title.textContent = "Lecture theatre: pick a cinema room";
  const note = document.createElement("p");
  note.className = "class-staff-only cinema-note";
  note.textContent = "Each room has its own screen, hands and questions. Go where your lecturer is.";
  const list = document.createElement("ul");
  list.className = "class-list";
  const enter = document.createElement("button");
  enter.type = "button";
  enter.className = "class-enter";
  enter.textContent = "Enter cinema room";
  const actions = document.createElement("div");
  actions.className = "class-actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  actions.append(closeBtn);
  card.append(title, note, list, enter, actions);
  root.append(card);
  document.body.append(root);

  let items: CinemaItem[] = [];
  let selected = 1;
  let open = false;
  const buttons = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>(".class-pick")];

  function select(n: number): void {
    selected = n;
    for (const b of buttons()) {
      const on = Number(b.dataset.n) === n;
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }
  function go(): void {
    const item = items.find((c) => c.n === selected);
    if (!item) return;
    hide();
    pick(item);
  }
  function render(): void {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.n;
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement("li");
        li.className = "class-row";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "class-pick";
        b.dataset.n = String(item.n);
        b.textContent = `Cinema Room ${item.n}`;
        if (item.online) {
          const here = document.createElement("span");
          here.className = "class-online";
          here.textContent = ` · ${item.online} here`;
          b.append(here);
        }
        const on = item.n === selected;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
        b.addEventListener("click", () => select(item.n));
        b.addEventListener("dblclick", () => {
          select(item.n);
          go();
        });
        li.append(b);
        return li;
      }),
    );
    if (focused && open) list.querySelector<HTMLButtonElement>(`[data-n="${focused}"]`)?.focus();
  }
  function hide(): void {
    if (!open) return;
    open = false;
    root.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  closeBtn.addEventListener("click", hide);
  enter.addEventListener("click", go);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while it is open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      return hide();
    }
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && at !== -1) {
      e.preventDefault();
      const next = all[(at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]!;
      select(Number(next.dataset.n));
      next.focus();
    } else if (e.key === "Enter" && !e.repeat && at !== -1) {
      e.preventDefault();
      select(Number(all[at]!.dataset.n));
      go();
    }
  });

  return {
    open(next) {
      items = next;
      // The first room with someone in it is likely where the lecture is; otherwise Room 1.
      selected = items.find((c) => c.online > 0)?.n ?? items[0]?.n ?? 1;
      open = true;
      root.hidden = false;
      render();
      list.querySelector<HTMLButtonElement>(`[data-n="${selected}"]`)?.focus();
    },
    update(next) {
      items = next;
      if (open) render();
    },
    close: hide,
    isOpen: () => open,
  };
}
