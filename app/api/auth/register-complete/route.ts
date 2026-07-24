import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { clearChallenge, createSession, getChallenge } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegistrationResponseJSON;

  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    return NextResponse.json(
      { error: "No teacher account" },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: process.env.ORIGIN!,
      expectedRPID: process.env.RP_ID!,
    });
  } catch {
    await clearChallenge();
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  await clearChallenge();

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  // Re-check the single-passkey invariant right before writing: two
  // concurrent registration ceremonies can both pass the register-begin
  // guard while passkeys.length === 0, so the check must be repeated here,
  // immediately before the write, to close the race.
  const existingPasskeyCount = await prisma.passkey.count({
    where: { teacherId: teacher.id },
  });
  if (existingPasskeyCount > 0) {
    return NextResponse.json(
      { error: "A passkey is already registered" },
      { status: 400 },
    );
  }

  const { credential } = verification.registrationInfo;

  await prisma.passkey.create({
    data: {
      teacherId: teacher.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
    },
  });

  await createSession(teacher.id);

  return NextResponse.json({ verified: true });
}
