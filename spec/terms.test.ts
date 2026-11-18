import { JSDOM } from "jsdom";
import { beforeEach, expect, it } from "vitest";

// The terms of use (client/src/terms.ts, the user 11/18): asked before signing up and before a guest
// comes in. The popup must be scrolled to its end before the box can be ticked, the box before the
// button, and "Cancel" says no; once agreed, this browser isn't asked again for the same version.

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
  const { window } = dom;
  Object.assign(globalThis, {
    document: window.document,
    localStorage: window.localStorage,
    requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
    HTMLElement: window.HTMLElement,
  });
});

const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
/** Pretends the text box is `tall` px of text in a `view` px window, scrolled to `top`. */
const scrollTo = (top: number): void => {
  const el = q<HTMLElement>(".terms-scroll");
  Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
  el.scrollTop = top;
  el.dispatchEvent(new dom.window.Event("scroll"));
};

it("keeps the box and the button locked until the end is read, then lets the visitor in", async () => {
  const { ensureTerms } = await import("../client/src/terms.ts");
  const answer = ensureTerms();
  const box = q<HTMLInputElement>(".terms-check input");
  const agree = q<HTMLButtonElement>(".terms-agree");
  expect(box.disabled).toBe(true);
  expect(agree.disabled).toBe(true);
  scrollTo(100);
  expect(box.disabled).toBe(true);
  scrollTo(700);
  expect(box.disabled).toBe(false);
  expect(agree.disabled).toBe(true);
  box.checked = true;
  box.dispatchEvent(new dom.window.Event("change"));
  expect(agree.disabled).toBe(false);
  agree.click();
  await expect(answer).resolves.toBe(true);
  expect(document.querySelector(".terms-root")).toBeNull();
  // Agreed once: no popup for the same version.
  await expect(ensureTerms()).resolves.toBe(true);
  expect(document.querySelector(".terms-root")).toBeNull();
});

it("says no when cancelled, and asks again next time", async () => {
  const { ensureTerms } = await import("../client/src/terms.ts");
  const first = ensureTerms();
  q<HTMLButtonElement>(".terms-row button:not(.terms-agree)").click();
  await expect(first).resolves.toBe(false);
  const second = ensureTerms();
  expect(document.querySelector(".terms-root")).not.toBeNull();
  q<HTMLButtonElement>(".terms-row button:not(.terms-agree)").click();
  await expect(second).resolves.toBe(false);
});

it("names the services and sources it relies on", async () => {
  const { ensureTerms } = await import("../client/src/terms.ts");
  void ensureTerms();
  const text = q(".terms-scroll").textContent ?? "";
  for (const word of ["OpenStreetMap", "Amazon Bedrock", "YouTube", "LiveKit", "unofficial"]) expect(text).toContain(word);
  q<HTMLButtonElement>(".terms-row button:not(.terms-agree)").click();
});
