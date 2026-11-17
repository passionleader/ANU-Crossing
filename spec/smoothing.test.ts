import { describe, expect, it } from "vitest";
import { DELAY_MS, Track } from "../client/src/smoothing.ts";

// Other people's figures glide through uneven updates (client/src/smoothing.ts):
// drawn DELAY_MS in the past, between the two updates around that moment.

const s = (t: number, x: number) => ({ t, x, y: 0, z: 0, rot: 0 });

describe("other people's movement is smoothed", () => {
  it("draws between two updates, a moment in the past", () => {
    const tr = new Track();
    tr.push(s(1000, 0));
    tr.push(s(1100, 1));
    expect(tr.at(1100 + DELAY_MS - 50)!.x).toBeCloseTo(0.5);
  });

  it("keeps moving steadily through a late update instead of stopping", () => {
    const tr = new Track();
    // Updates every 100 ms, then one 250 ms late, then two at once.
    for (const [t, x] of [[0, 0], [100, 1], [200, 2], [450, 3], [460, 4], [500, 5]] as const) tr.push(s(t, x));
    const xs = [300, 340, 380, 420].map((now) => tr.at(now)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });

  it("stays on the last spot once updates stop", () => {
    const tr = new Track();
    tr.push(s(0, 0));
    tr.push(s(100, 2));
    expect(tr.at(5000)!.x).toBe(2);
  });

  it("jumps rather than slides across a door's distance", () => {
    const tr = new Track();
    tr.push(s(0, 0));
    tr.push(s(100, 40));
    expect(tr.at(100 + DELAY_MS - 50)!.x).toBe(40);
  });

  it("starts a walk after standing still at walking pace, not crawling from long ago", () => {
    const tr = new Track();
    tr.push(s(0, 0));
    tr.push(s(5000, 0.4));
    // Half way through the 100 ms step, not 1% of the way through five seconds.
    expect(tr.at(5000 + DELAY_MS - 50)!.x).toBeCloseTo(0.2);
  });
});
