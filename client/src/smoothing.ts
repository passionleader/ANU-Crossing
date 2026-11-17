// Other people's figures, played a little in the past so they glide even when
// the server's updates arrive unevenly (the user, 11/18: smooth on the course's
// Fly server, stuttering on Render, same code). The server sends positions every
// 100 ms; from Render they often came 200-250 ms apart and then in a bunch, and a
// figure that only chased its latest position stopped, then jumped. Now each
// update is kept with the time it arrived, and a figure is drawn where its
// updates say it was DELAY ms ago, between the two around that moment. If the
// updates stop (they stood still: the server sends nothing), it stays on the
// last one; a gap far longer than usual (a teleport, a door) snaps instead of
// sliding across the map.

export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  rot: number;
}

/** How far in the past figures are drawn: enough to ride out a late update or two. */
export const DELAY_MS = 220;
/** Updates kept per figure: about a second and a half at the server's 100 ms. */
const KEEP = 16;
/** Further than this between two updates is a jump (a door, a seat), not a walk. */
const SNAP_M = 6;
/** The server's own pace: updates come every 100 ms when nothing is in the way. */
const SPACING_MS = 100;
/** How far ahead of its arrival a bunched update may be placed (less than DELAY_MS, so it's still reached in time). */
const LEAD_MS = 160;

export class Track {
  private samples: Sample[] = [];

  push(s: Sample): void {
    const last = this.samples.at(-1);
    // The same spot again (they sent nothing new): keep the older time, so the
    // glide toward it isn't stretched.
    if (last && last.x === s.x && last.y === s.y && last.z === s.z && last.rot === s.rot) return;
    if (last && Math.hypot(s.x - last.x, s.z - last.z) > SNAP_M) this.samples = [];
    // Part of a bunch: placed at the server's pace after the one before, not all at once.
    else if (last && s.t - last.t < SPACING_MS && s.t - last.t > -LEAD_MS) s = { ...s, t: Math.min(last.t + SPACING_MS, s.t + LEAD_MS) };
    // Standing still, then walking: start the walk from where they stood now,
    // not from when they stopped, or the first step would crawl over seconds.
    else if (last && s.t - last.t > DELAY_MS * 2) this.samples.push({ ...last, t: s.t - 100 });
    this.samples.push(s);
    if (this.samples.length > KEEP) this.samples.splice(0, this.samples.length - KEEP);
  }

  /** Clears the history: the next update is drawn at once (a seat, a room). */
  reset(): void {
    this.samples = [];
  }

  /** Where to draw them at `now`, or null before the first update. */
  at(now: number): Sample | null {
    const s = this.samples;
    if (!s.length) return null;
    const when = now - DELAY_MS;
    if (when <= s[0]!.t) return s[0]!;
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (when < a.t) continue;
      if (when >= b.t) return b;
      const k = (when - a.t) / (b.t - a.t);
      const turn = Math.atan2(Math.sin(b.rot - a.rot), Math.cos(b.rot - a.rot));
      return { t: when, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, rot: a.rot + turn * k };
    }
    return s.at(-1)!;
  }
}
