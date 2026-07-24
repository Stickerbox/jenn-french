import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { setChallenge } from "@/lib/session";

const TEACHER_USERNAME = "teacher";
const RP_NAME = "Word of the Day";

export async function POST() {
  const existing = await prisma.teacher.findFirst({
    include: { passkeys: true },
  });

  if (existing && existing.passkeys.length > 0) {
    return NextResponse.json(
      { error: "A passkey is already registered" },
      { status: 400 },
    );
  }

  const teacher =
    existing ??
    (await prisma.teacher.create({ data: { username: TEACHER_USERNAME } }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: process.env.RP_ID!,
    userName: teacher.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setChallenge(options.challenge);

  return NextResponse.json(options);
}
