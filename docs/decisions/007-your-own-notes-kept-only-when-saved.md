# 007: Your own notes are kept only when you save them

Status: accepted (portfolio, 18 November 2026)

## Context

My Room and the lecture theatre both gave you a page of Markdown notes. At
first it was one page kept for you (in the browser, then in My Room's row),
quietly shared between the two places. A meeting room's shared notes worked
the other way: gone when the room empties, unless someone presses Save. Two
rules for the same kind of page confused people, and a page that silently
follows you between a lecture and your room was not what the owner wanted.

## Options

- A. Keep every page as you type, per place (one for My Room, one per cinema
  room).
- B. Keep nothing while you type; "Save" puts a copy in your mailbox, like a
  meeting room's notes.

## Decision

B, chosen by the owner. Your notes (a cinema room's Notes, My Room's desk,
the room menu's "My notes") hold nothing until you press 💾 Save, which keeps a
copy in the mailbox's Saved tab for 30 days, for you alone, with the place it
was written ("Cinema Room 2", "My Room"). Closing the page with unsaved words
asks first: save them, clear them, or keep writing; leaving the cinema room or
going home asks the same. My Room's bookcase (E) opens the Saved tab. Guests
may write but not save. Pictures can be dragged, pasted or added with a
button (for phones); each goes up as soon as it is dropped, is fetched only by
its writer, and is kept only if a saved copy shows it (else purged after a
day).

Why: one rule for every notes page is easier to learn, and keeping nothing by
default matches decision 001 (store only what is needed). Saving on purpose
also gives a natural place to find old notes (the mailbox and the bookcase).

## Consequences

- Words written and closed without saving are gone; the popup is what stands
  between a person and that loss.
- A dropped picture is uploaded before the notes are saved, so unsaved
  pictures must be purged (`releaseKeptFiles`, daily).
- The old `my_rooms.notebook` column is no longer written by the client.

## How it's checked

`spec/myroom.test.ts` ("saves your own notes to your mailbox only when you
press Save, for you alone, never a guest's") and `spec/rules.test.ts`
("pictures in your own notes"). The popup and the bookcase are judged in the
browser.
