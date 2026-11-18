import { JSDOM } from "jsdom";
import { beforeAll, expect, it } from "vitest";

// My Room's notebook and the theatre's notes (the user, 11/18) take to-do lines: "- [ ] x" draws an
// empty box and "- [x] x" a ticked one, as text (never an input), and anything else in brackets
// stays as written.
beforeAll(() => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  Object.assign(globalThis, { document: window.document, Node: window.Node });
});

it("draws to-do boxes in a list", async () => {
  const { renderMarkdown } = await import("../client/src/markdown.ts");
  const box = document.createElement("div");
  box.append(renderMarkdown("- [ ] Lab 3\n- [x] Quiz\n- [link] stays"));
  const items = [...box.querySelectorAll("li")].map((li) => li.textContent);
  expect(items).toEqual(["☐ Lab 3", "☑ Quiz", "[link] stays"]);
  expect(box.querySelector("input")).toBeNull();
});
