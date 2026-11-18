import "./dropzone.css";

// Dropping pictures into Markdown (the user, 11/18: every board's post, a room's shared notes, your
// own notes). A drop only on the text box was easy to miss, and a file let go anywhere else made the
// browser leave the app to show it. So: the whole editor takes the drop, says so while a file is
// over it ("Drop the picture here"), and a file let go anywhere else on the page does nothing.

/** A file input (a board's Files box) takes its own drop, natively: never stopped, never turned into a picture. */
const intoFileInput = (e: DragEvent): boolean => e.target instanceof HTMLInputElement && e.target.type === "file";
let guarded = false;
/** Once per page: a file dropped outside an editor is ignored, never opened in place of the app. */
function guardPage(): void {
  if (guarded) return;
  guarded = true;
  const hasFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes("Files") && !intoFileInput(e);
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e) || e.defaultPrevented) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
}

/**
 * Makes `zone` (an editor's whole window or form) take dropped files: `onFiles` gets them, a label
 * covers the zone while a file is dragged over it. `active()` says whether it takes them right now
 * (a form that is showing), defaulting to whenever the zone is on screen.
 */
export function dropPictures(zone: HTMLElement, onFiles: (files: File[]) => void, label = "Drop the picture here", active: () => boolean = () => zone.isConnected && zone.offsetParent !== null): void {
  guardPage();
  zone.classList.add("dropzone");
  const cover = document.createElement("div");
  cover.className = "dropzone-cover";
  cover.textContent = `🖼 ${label}`;
  cover.setAttribute("aria-hidden", "true");
  zone.append(cover);
  // dragenter/dragleave fire for every child crossed, so count them.
  let depth = 0;
  // A drag that ends outside the window (or is cancelled) may not say so here: while a file is over
  // the zone, dragover comes several times a second, so its stopping clears the cover too.
  let quiet = 0;
  const still = (): void => {
    window.clearTimeout(quiet);
    quiet = window.setTimeout(() => off(), 400);
  };
  const hasFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes("Files") && !intoFileInput(e);
  const off = (): void => {
    depth = 0;
    window.clearTimeout(quiet);
    zone.classList.remove("is-dropping");
  };
  zone.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || !active()) return;
    e.preventDefault();
    depth++;
    zone.classList.add("is-dropping");
  });
  zone.addEventListener("dragover", (e) => {
    // Over the Files box: its own drop, so no "into the text" cover.
    if (intoFileInput(e)) return zone.classList.remove("is-dropping");
    if (!hasFiles(e) || !active()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    zone.classList.add("is-dropping");
    still();
  });
  zone.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove("is-dropping");
  });
  zone.addEventListener("drop", (e) => {
    off();
    if (!hasFiles(e) || !active()) return;
    e.preventDefault();
    e.stopPropagation();
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) onFiles(files);
  });
  window.addEventListener("dragend", off);
  window.addEventListener("drop", off);
}
