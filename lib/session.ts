import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "teacherId";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function createSession(teacherId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, teacherId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!teacherId) return null;

  return prisma.teacher.findUnique({ where: { id: teacherId } });
}

const CHALLENGE_COOKIE = "webauthn-challenge";
const CHALLENGE_MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export async function setChallenge(challenge: string) {
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
  });
}

export async function getChallenge(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CHALLENGE_COOKIE)?.value ?? null;
}

export async function clearChallenge() {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
}
