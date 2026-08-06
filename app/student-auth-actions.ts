"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, newToken } from "@/lib/student-tokens";
import { checkPassword, normaliseEmail } from "@/lib/student-credentials";
import { credentialProblemLabel } from "@/lib/student-auth-labels";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { clearAttempts, isLockedFor, noteFailure } from "@/lib/login-throttle";
import { currentStrings } from "@/lib/locale";

// A year, matching what middleware.ts sets when it moves ?k= into a cookie.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// The throttle's two namespaces. Prefixed so they cannot collide: a student
// whose slug happened to equal someone's address would otherwise share one
// counter, and /signin's failures would lock a per-page form that is not it.
const slugKey = (slug: string) => `slug:${slug}`;
const emailKey = (email: string) => `email:${email}`;

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
  // Read once and threaded through: this is a "use server" action, so
  // headers() is in scope, but every early return below needs the same
  // dictionary and there is no reason to re-derive it per branch.
  const strings = await currentStrings();
  const auth = strings.student.auth;

  // Before any hashing: hashing is expensive on purpose, so an unthrottled
  // endpoint that hashes attacker input is a CPU-exhaustion vector against a
  // two-core box.
  if (isLockedFor(slugKey(slug))) return { error: auth.tooManyTries };

  const normalised = normaliseEmail(email);
  if (normalised === null) {
    return { error: credentialProblemLabel("bad-email", strings) };
  }

  const problem = checkPassword(password);
  if (problem !== null) {
    return { error: credentialProblemLabel(problem, strings) };
  }

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group || group.isEveryone || group.chatToken === null) {
    return { error: auth.genericFailure };
  }

  const store = await cookies();
  const presented = store.get(cookieNameFor(slug))?.value ?? null;
  if (presented !== group.chatToken) {
    noteFailure(slugKey(slug));
    return { error: auth.inviteUsed };
  }

  // Rotating the token is what SPENDS the invitation, and it is load-bearing
  // rather than tidy: `unlocked` is holdsToken && claimed, so the moment this
  // student is claimed, any other copy of this same invite link would satisfy
  // both halves and be admitted WITHOUT a password.
  const freshToken = newToken();
  const passwordHash = await hashPassword(password);

  // A conditional update rather than a transaction: two submissions racing both
  // read "unclaimed", and the loser must not overwrite the winner's account.
  let count: number;
  try {
    ({ count } = await prisma.group.updateMany({
      where: { id: group.id, passwordHash: null },
      data: {
        email: normalised,
        passwordHash,
        claimedAt: new Date(),
        chatToken: freshToken,
      },
    }));
  } catch (err) {
    // Group.email is unique, so a second student claiming with an address
    // already in use lands here. Without this it would be a raw constraint
    // error behind a generic failure, and the family would have no idea the
    // address was the problem.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { error: auth.emailTaken };
    }
    throw err;
  }
  if (count !== 1) return { error: auth.inviteUsed };

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
  const strings = await currentStrings();
  const auth = strings.student.auth;

  if (isLockedFor(slugKey(slug))) return { error: auth.tooManyTries };

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
    return { error: auth.signInFailed };
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
    return { error: auth.signInFailed };
  }

  await setStudentCookie(slug, group.chatToken);
  clearAttempts(slugKey(slug));
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

// The /signin door: an address and a password, no slug anywhere.
//
// Not AuthResult, because the caller needs the slug to redirect. Widening
// AuthResult itself would let every existing caller ignore a field it suddenly
// had.
export type EmailSignInResult =
  | { ok: true; slug: string }
  | { error: string };

// EVERY DEFENCE IN signInStudent IS CARRIED ACROSS DELIBERATELY, because this
// endpoint is reachable WITHOUT KNOWING ANY SLUG — which makes it a better
// target than the per-page form, not a worse one.
export async function signInByEmail(
  email: string,
  password: string,
): Promise<EmailSignInResult> {
  const auth = (await currentStrings()).student.auth;

  // Normalised first because it is pure and cheap, and because the throttle key
  // has to be the same string every time or the counter never accumulates. A
  // malformed address still gets a key — from the raw input — so hammering this
  // with rubbish is throttled too.
  const normalised = normaliseEmail(email);
  const key = emailKey(normalised ?? email.trim().toLowerCase());

  // BEFORE ANY HASHING. Hashing is expensive on purpose, so an unthrottled
  // endpoint that hashes attacker input is a CPU-exhaustion vector against a
  // two-core box — and this one takes no slug, so it needs no guessing at all
  // to reach.
  if (isLockedFor(key)) return { error: auth.tooManyTries };

  const group =
    normalised === null
      ? null
      : await prisma.group.findUnique({
          where: { email: normalised },
          select: {
            slug: true,
            isEveryone: true,
            chatToken: true,
            passwordHash: true,
          },
        });

  // No such address, the everyone group, or an account never claimed. HASH THE
  // SUBMITTED PASSWORD AND THROW THE RESULT AWAY: an instant answer here would
  // tell someone which addresses are real, which is the one thing a door that
  // takes only an address must not leak.
  if (
    !group ||
    group.isEveryone ||
    group.chatToken === null ||
    group.passwordHash === null
  ) {
    await hashPassword(password);
    noteFailure(key);
    return { error: auth.signInFailed };
  }

  if (!(await verifyPassword(password, group.passwordHash))) {
    noteFailure(key);
    return { error: auth.signInFailed };
  }

  await setStudentCookie(group.slug, group.chatToken);
  clearAttempts(key);

  // Slug only, and only on success. The address is PII and never goes into a
  // log — the same rule claimStudent follows.
  console.info(`[student-auth] signed in ${group.slug}`);
  revalidatePath(`/g/${group.slug}`);
  return { ok: true, slug: group.slug };
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
