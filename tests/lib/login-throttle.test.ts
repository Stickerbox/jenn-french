import { describe, expect, it } from "vitest";
import {
  isLocked,
  recordFailure,
  MAX_FAILURES,
  WINDOW_MS,
  type AttemptState,
} from "@/lib/login-throttle";

// A fake clock, passed in: the window is fifteen minutes and no test may wait.
function failTimes(times: number, at = 0): AttemptState {
  let state: AttemptState | undefined;
  for (let i = 0; i < times; i += 1) state = recordFailure(state, at);
  return state as AttemptState;
}

describe("login throttle", () => {
  it("is not locked with no history", () => {
    expect(isLocked(undefined, 0)).toBe(false);
  });

  it("is not locked one attempt short of the maximum", () => {
    expect(isLocked(failTimes(MAX_FAILURES - 1), 0)).toBe(false);
  });

  it("locks on the attempt that reaches the maximum", () => {
    expect(isLocked(failTimes(MAX_FAILURES), 0)).toBe(true);
  });

  it("stays locked anywhere inside the window", () => {
    expect(isLocked(failTimes(MAX_FAILURES), WINDOW_MS - 1)).toBe(true);
  });

  it("releases itself once the window has passed, with no intervention", () => {
    expect(isLocked(failTimes(MAX_FAILURES), WINDOW_MS)).toBe(false);
  });

  it("counts from the first failure, not the most recent", () => {
    // Otherwise every new attempt would push the window forward and a slow
    // attacker would never trip it.
    expect(recordFailure(failTimes(2), 1000).firstFailureAt).toBe(0);
  });

  it("starts a fresh window rather than accumulating forever", () => {
    // Nine wrong guesses, a long silence, then one more: a forgetful student,
    // not an attack. The count restarts instead of tipping over the limit.
    const later = recordFailure(failTimes(MAX_FAILURES - 1), WINDOW_MS + 1);
    expect(later.failures).toBe(1);
    expect(isLocked(later, WINDOW_MS + 1)).toBe(false);
  });
});
