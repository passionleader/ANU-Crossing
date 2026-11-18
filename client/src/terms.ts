// The terms of use, asked before signing up and before coming in as a guest (the user, 11/18): a
// scrollable popup that must be read to the end, then ticked, then agreed to. Remembered in this
// browser for this version of the text, so a returning guest isn't asked every visit; a change to
// the text (bump VERSION) asks everyone again. Its stylesheet (terms.css) is imported by signin.ts, so
// this file stays free of CSS and can be run by a spec. Kept in the browser only: the server doesn't record it.

export const TERMS_VERSION = "2026-11-18";
const KEY = "anu-crossing-terms";

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (): void => {
  try {
    localStorage.setItem(KEY, TERMS_VERSION);
  } catch {
    // Private window or blocked storage: asked again next time.
  }
};

/** [heading, paragraphs] in the order shown. */
const SECTIONS: [string, string[]][] = [
  ["What this is", ["ANU Crossing is an unofficial, student-made project. It is not run, endorsed or checked by the Australian National University or any organisation named in it. Nobody who posts here has been verified."]],
  ["Your account and what we keep", [
    "Signing up uses an ANU email address (a student number or a staff address) and a six-digit code. We keep your name, a salted hash of your password, your role, your look and your last position. Guests keep only a name and a browser token, deleted a day after they were last seen.",
    "What you write (sticky notes, board posts, comments, mail, saved notes) is kept for the times the app says, then deleted. Map chat is kept for a day only so that it can be attached to a report about a person. An admin log of actions, with IP addresses, is kept for seven days. Voice is never recorded.",
  ]],
  ["Your content", [
    "You keep the rights to what you write or upload. By posting it you let this service store it and show it to the people it is meant for, for as long as it is kept. Only post what you have the right to share, and don't post other people's private information, or anything unlawful, abusive or misleading. Pictures and files you upload are stored privately and shown only to those who may see them.",
    "Items that others report can be hidden, and an admin may remove content or stop an account.",
  ]],
  ["The AI campus assistants", [
    "The assistants are AI characters. They answer only from public web pages of ANU, ANUSA, ANU Sport and Transport Canberra that this project has read, and they link the page each answer came from. Those pages belong to their owners and are used only to answer your question; they are not republished here. Answers can be out of date or wrong: check the linked page, and don't rely on an assistant for decisions about enrolment, fees, safety or health.",
    "What you ask is sent to a language model on Amazon Bedrock to write the answer. It is not stored or logged by this app.",
  ]],
  ["Videos, voice and other services", [
    "A shared video is played by YouTube's or Vimeo's own player, so watching it reaches that site and is under its terms. Voice and screen sharing go through LiveKit Cloud. Sign-up emails are sent with Amazon SES and files are kept in Amazon S3. Weather comes from Open-Meteo, which is not told who you are.",
  ]],
  ["Where it runs", [
    "The server currently runs on Render in Singapore; files, email and the assistants' models run on AWS in Sydney. The free server keeps no disk, so accounts, posts and notes can be erased whenever it restarts. Treat this service as a place to meet, not as somewhere to keep anything you need.",
  ]],
  ["Maps, art and music", [
    "Positions of buildings and paths use OpenStreetMap data, © OpenStreetMap contributors, under the Open Database Licence (openstreetmap.org/copyright). Models and sounds are mostly CC0 from Kenney, Quaternius, Poly Haven and others; some textures and all music were made with Google's Gemini. Everything is credited in the app's Credits page. Names of real places are used to describe the campus and don't mean any business or group has agreed to appear.",
  ]],
  ["No guarantee", [
    "This service is provided as it is, free, with no promise that it will stay up, keep your data, or be right. To the extent the law allows, its author isn't responsible for loss from using it. Nothing here limits rights you have under Australian law that can't be limited.",
  ]],
  ["Contact", ["To ask about your data, report a problem or ask for something to be removed, email the author at u8321477@anu.edu.au, or use the bug report button (open to anyone)."]],
];

let open = false;

/**
 * Resolves true when the visitor has agreed (now, or earlier in this browser to this version of the
 * terms), false if they closed the popup.
 */
export function ensureTerms(): Promise<boolean> {
  if (read() === TERMS_VERSION) return Promise.resolve(true);
  if (open) return Promise.resolve(false);
  open = true;
  return new Promise((done) => {
    const root = document.createElement("div");
    root.className = "terms-root";
    root.dataset.keep = "";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "terms-title");
    const card = document.createElement("div");
    card.className = "terms-card";
    const title = document.createElement("h2");
    title.id = "terms-title";
    title.textContent = "Terms of use";
    const lead = document.createElement("p");
    lead.className = "terms-lead";
    lead.textContent = "Please read these to the end. They say what this unofficial project keeps and how it works.";
    const scroll = document.createElement("div");
    scroll.className = "terms-scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "The terms, scrollable");
    for (const [h, paras] of SECTIONS) {
      const head = document.createElement("h3");
      head.textContent = h;
      scroll.append(head);
      for (const t of paras) {
        const p = document.createElement("p");
        p.textContent = t;
        scroll.append(p);
      }
    }
    const version = document.createElement("p");
    version.className = "terms-version";
    version.textContent = `Version ${TERMS_VERSION}`;
    scroll.append(version);

    const label = document.createElement("label");
    label.className = "terms-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.disabled = true;
    const text = document.createElement("span");
    text.textContent = "I have read the terms and I agree.";
    label.append(box, text);
    const hint = document.createElement("p");
    hint.className = "terms-hint";
    hint.textContent = "Scroll to the end to tick the box.";
    const row = document.createElement("div");
    row.className = "terms-row";
    const agree = document.createElement("button");
    agree.type = "button";
    agree.className = "terms-agree";
    agree.textContent = "Agree and continue";
    agree.disabled = true;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    row.append(agree, cancel);
    card.append(title, lead, scroll, label, hint, row);
    root.append(card);
    document.body.append(root);

    const atEnd = (): boolean => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 6;
    const check = (): void => {
      if (!box.disabled || !atEnd()) return;
      box.disabled = false;
      hint.hidden = true;
    };
    scroll.addEventListener("scroll", check);
    // A tall window may show it all with nothing to scroll.
    requestAnimationFrame(check);
    box.addEventListener("change", () => (agree.disabled = !box.checked));

    const finish = (ok: boolean): void => {
      if (ok) write();
      open = false;
      root.remove();
      done(ok);
    };
    agree.addEventListener("click", () => box.checked && finish(true));
    cancel.addEventListener("click", () => finish(false));
    root.addEventListener("keydown", (e) => {
      // Keep game keys out of the scene while it's up.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    scroll.focus();
  });
}
