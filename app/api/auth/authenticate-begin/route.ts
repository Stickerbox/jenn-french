import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { setChallenge } from "@/lib/session";

export async function POST() {
  const teacher = await prisma.teacher.findFirst({
    include: { passkeys: true },
  });

  if (!teacher || teacher.passkeys.length === 0) {
    return NextResponse.json(
      { error: "No passkey registered yet" },
      { status: 400 },
    );
  }

  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID!,
    userVerification: "preferred",
    allowCredentials: teacher.passkeys.map((passkey) => ({
      id: passkey.credentialId,
    })),
  });

  await setChallenge(options.challenge);

  return NextResponse.json(options);
}
