// Ten wrong guesses for one student inside fifteen minutes locks that student's
// sign-in for fifteen minutes. A success clears it.
//
// Keyed by slug, not by IP. The attack is against one student, and an IP behind
// nginx means trusting X-Forwarded-For, a header the client sets. The accepted
// cost is that someone who knows a slug can lock that student out on purpose:
// bounded to fifteen minutes, self-healing, no action needed from Jenn — a
// better failure than a limit anyone can bypass by varying a header.

export type AttemptState = { failures: number; firstFailureAt: number };

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// The pure half. `now` is an argument so the window arithmetic is provable in a
// test with a fake clock rather than a sleep.
export function recordFailure(
  state: AttemptState | undefined,
  now: number,
): AttemptState {
  // An expired window starts over rather than accumulating forever: ten wrong
  // guesses spread across a year are a forgetful student, not an attack.
  if (!state || now - state.firstFailureAt >= WINDOW_MS) {
    return { failures: 1, firstFailureAt: now };
  }
  // firstFailureAt is carried, not refreshed — otherwise each new attempt would
  // push the window forward and a slow attacker would never trip the limit.
  return {
    failures: state.failures + 1,
    firstFailureAt: state.firstFailureAt,
  };
}

export function isLocked(
  state: AttemptState | undefined,
  now: number,
): boolean {
  if (!state) return false;
  if (now - state.firstFailureAt >= WINDOW_MS) return false;
  return state.failures >= MAX_FAILURES;
}

// The stateful half. Held on globalThis for the same reason lib/prisma.ts and
// lib/chat-bus.ts are: dev's module reloading would otherwise hand each reload
// a fresh Map and reset every counter on each edit.
//
// This is correct ONLY because pm2 runs this app as a single process in fork
// mode. Under cluster mode each worker would keep its own counter and the limit
// would silently become as many times looser as there are workers — the same
// trap the chat bus and the live whiteboard carry. See docs/DEPLOYMENT.md
// before changing how the app is started.
const globalForThrottle = globalThis as unknown as {
  loginAttempts: Map<string, AttemptState> | undefined;
};

const attempts =
  globalForThrottle.loginAttempts ?? new Map<string, AttemptState>();

if (process.env.NODE_ENV !== "production") {
  globalForThrottle.loginAttempts = attempts;
}

export function isSlugLocked(slug: string, now = Date.now()): boolean {
  return isLocked(attempts.get(slug), now);
}

export function noteFailure(slug: string, now = Date.now()): void {
  attempts.set(slug, recordFailure(attempts.get(slug), now));
}

export function clearAttempts(slug: string): void {
  attempts.delete(slug);
}
