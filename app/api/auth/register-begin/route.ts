import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { Prisma } from "@prisma/client";
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

  let teacher: { id: string; username: string };
  if (existing) {
    teacher = existing;
  } else {
    try {
      teacher = await prisma.teacher.create({
        data: { username: TEACHER_USERNAME },
      });
    } catch (err) {
      // Two concurrent first-ever register-begin calls can race on the
      // unique `username` constraint; the loser should get a graceful
      // error instead of an unhandled 500.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Registration already in progress, please try again" },
          { status: 400 },
        );
      }
      throw err;
    }
  }

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
