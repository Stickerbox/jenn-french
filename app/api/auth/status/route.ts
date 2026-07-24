import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const count = await prisma.passkey.count();
  return NextResponse.json({ hasPasskey: count > 0 });
}
