"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, newToken } from "@/lib/student-tokens";
import { checkPassword, normaliseEmail } from "@/lib/student-credentials";
import {
  credentialProblemLabel,
  GENERIC_FAILURE,
  INVITE_USED,
  SIGN_IN_FAILED,
  TOO_MANY_TRIES,
} from "@/lib/student-auth-labels";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { clearAttempts, isLockedFor, noteFailure } from "@/lib/login-throttle";

// A year, matching what middleware.ts sets when it moves ?k= into a cookie.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// The throttle's two namespaces. Prefixed so they cannot collide: a student
// whose slug happened to equal someone's address would otherwise share one
// counter, and /signin's failures would lock a per-page form that is not it.
const slugKey = (slug: string) => `slug:${slug}`;

// A result rather than a thrown Error, unlike every action in app/actions.ts.
// The message is the product here: specific for validation, deliberately
// uniform for every sign-in failure, and never an internal string.
export type AuthResult = { ok: true } | { error: string };

async function setStudentCookie(slug: string, token: string) {
  const store = await cookies();
  // Identical to what middleware.ts sets, deliberately — including path "/"
  // rather than /g/<slug>, because a path-scoped cookie would never be sent to
  // /api/chat/<slug>. The per-student NAME is what keeps students separate.
  store.set(cookieNameFor(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// The first sign-in IS the sign-up. What authorises it is the invite token,
// which this reads from the cookie itself: hiding the form is not a guard, the
// same reason deleteGroup re-checks canDeleteGroup server-side.
export async function claimStudent(
  slug: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  // Before any hashing: hashing is expensive on purpose, so an unthrottled
  // endpoint that hashes attacker input is a CPU-exhaustion vector against a
  // two-core box.
  if (isLockedFor(slugKey(slug))) return { error: TOO_MANY_TRIES };

  const normalised = normaliseEmail(email);
  if (normalised === null) return { error: credentialProblemLabel("bad-email") };

  const problem = checkPassword(password);
  if (problem !== null) return { error: credentialProblemLabel(problem) };

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group || group.isEveryone || group.chatToken === null) {
    return { error: GENERIC_FAILURE };
  }

  const store = await cookies();
  const presented = store.get(cookieNameFor(slug))?.value ?? null;
  if (presented !== group.chatToken) {
    noteFailure(slugKey(slug));
    return { error: INVITE_USED };
  }

  // Rotating the token is what SPENDS the invitation, and it is load-bearing
  // rather than tidy: `unlocked` is holdsToken && claimed, so the moment this
  // student is claimed, any other copy of this same invite link would satisfy
  // both halves and be admitted WITHOUT a password.
  const freshToken = newToken();
  const passwordHash = await hashPassword(password);

  // A conditional update rather than a transaction: two submissions racing both
  // read "unclaimed", and the loser must not overwrite the winner's account.
  const { count } = await prisma.group.updateMany({
    where: { id: group.id, passwordHash: null },
    data: {
      email: normalised,
      passwordHash,
      claimedAt: new Date(),
      chatToken: freshToken,
    },
  });
  if (count !== 1) return { error: INVITE_USED };

  await setStudentCookie(slug, freshToken);
  clearAttempts(slugKey(slug));

  // No chatBus.publishRevoke here, unlike resetStudentSignIn, and the absence
  // is deliberate: before a claim nobody is signed in, because `unlocked`
  // requires `claimed`, so there is no open stream on this group to revoke.

  // Slug only. The email is PII and never goes into a log.
  console.info(`[student-auth] claimed ${slug}`);
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

export async function signInStudent(
  slug: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  if (isLockedFor(slugKey(slug))) return { error: TOO_MANY_TRIES };

  const normalised = normaliseEmail(email);

  const group = await prisma.group.findUnique({
    where: { slug },
    select: {
      isEveryone: true,
      chatToken: true,
      email: true,
      passwordHash: true,
    },
  });
  if (!group || group.isEveryone || group.chatToken === null) {
    noteFailure(slugKey(slug));
    return { error: SIGN_IN_FAILED };
  }

  // Both checks are computed BEFORE the branch below, so a wrong email cannot
  // skip the hash and turn "no such student" into a measurably faster answer.
  let passwordOk = false;
  if (group.passwordHash !== null) {
    passwordOk = await verifyPassword(password, group.passwordHash);
  } else {
    // No account here. Hash the submitted password and throw the result away,
    // so an unclaimed student costs the same as a wrong password — an instant
    // failure would tell someone guessing slugs which students are claimable.
    await hashPassword(password);
  }

  const emailOk =
    normalised !== null && group.email !== null && normalised === group.email;

  if (!emailOk || !passwordOk) {
    noteFailure(slugKey(slug));
    // One message for every failure. Never which half was wrong.
    return { error: SIGN_IN_FAILED };
  }

  await setStudentCookie(slug, group.chatToken);
  clearAttempts(slugKey(slug));
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

// Deletes the one cookie. Signing out is not revocation and rotates nothing —
// the shared family laptop is the case this exists for.
export async function signOutStudent(slug: string): Promise<void> {
  const store = await cookies();
  // The object form, with the same path the cookie was set with: deleting by
  // bare name would not match a cookie scoped to "/".
  store.delete({ name: cookieNameFor(slug), path: "/" });
  revalidatePath(`/g/${slug}`);
}
