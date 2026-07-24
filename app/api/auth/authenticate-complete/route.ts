import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { clearChallenge, createSession, getChallenge } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AuthenticationResponseJSON;

  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: body.id },
  });

  if (!passkey) {
    return NextResponse.json({ error: "Unknown passkey" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: process.env.ORIGIN!,
      expectedRPID: process.env.RP_ID!,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
      },
    });
  } catch {
    await clearChallenge();
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  await clearChallenge();

  if (!verification.verified) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  await createSession(passkey.teacherId);

  return NextResponse.json({ verified: true });
}
