import { describe, expect, it } from "vitest";

import {
  getSessionRefreshSchedule,
  MIN_SESSION_REFRESH_DELAY_MS,
  SESSION_REFRESH_LEAD_MS,
} from "./session";

const NOW = 1_700_000_000_000;

/** An `exp` claim (seconds) for a token with `ms` left at {@link NOW}. */
function expiringIn(ms: number): number {
  return (NOW + ms) / 1000;
}

describe("getSessionRefreshSchedule", () => {
  it("renews a normal-lifetime token one lead period before it expires", () => {
    const oneHour = 60 * 60 * 1000;

    expect(getSessionRefreshSchedule(expiringIn(oneHour), NOW)).toEqual({
      kind: "refresh",
      delayMs: oneHour - SESSION_REFRESH_LEAD_MS,
    });
  });

  it.each([
    ["one second", 1_000],
    ["half the floor", MIN_SESSION_REFRESH_DELAY_MS / 2],
    ["just under the lead period", SESSION_REFRESH_LEAD_MS - 1],
    ["just over the lead period", SESSION_REFRESH_LEAD_MS + 1],
  ])(
    "floors the delay for a token with %s left instead of firing immediately",
    (_label, timeLeftMs) => {
      const schedule = getSessionRefreshSchedule(expiringIn(timeLeftMs), NOW);

      // The whole point of the bound: a short-lived token must never produce a
      // zero-delay renewal, because each renewal reschedules the next one.
      expect(schedule).toEqual({
        kind: "refresh",
        delayMs: MIN_SESSION_REFRESH_DELAY_MS,
      });
    },
  );

  it("never returns a delay below the floor for any positive lifetime", () => {
    for (let timeLeftMs = 1; timeLeftMs < SESSION_REFRESH_LEAD_MS; timeLeftMs += 997) {
      const schedule = getSessionRefreshSchedule(expiringIn(timeLeftMs), NOW);

      expect(schedule.kind).toBe("refresh");
      expect(
        schedule.kind === "refresh" ? schedule.delayMs : 0,
      ).toBeGreaterThanOrEqual(MIN_SESSION_REFRESH_DELAY_MS);
    }
  });

  it.each([
    ["already lapsed", -1_000],
    ["lapsing exactly now", 0],
  ])("reports a token %s as expired", (_label, timeLeftMs) => {
    expect(getSessionRefreshSchedule(expiringIn(timeLeftMs), NOW)).toEqual({
      kind: "unusable",
      reason: "expired",
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "1700000000"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an object", { exp: 1 }],
  ])("reports %s as an invalid expiry rather than a NaN delay", (_label, exp) => {
    // `setTimeout(fn, NaN)` runs on the next tick, which is how a malformed
    // claim used to turn into an immediate re-authentication.
    expect(getSessionRefreshSchedule(exp, NOW)).toEqual({
      kind: "unusable",
      reason: "invalid-expiry",
    });
  });

  it("defaults to the current time", () => {
    const schedule = getSessionRefreshSchedule(Date.now() / 1000 + 3600);

    expect(schedule.kind).toBe("refresh");
  });
});
