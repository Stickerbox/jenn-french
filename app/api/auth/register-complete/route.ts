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

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
  });

  await clearChallenge();

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
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
