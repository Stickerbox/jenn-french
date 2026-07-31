import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  // The board's date is stamped here rather than at /finish, so a lesson that
  // crosses UTC midnight belongs to the day it started.
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  if (!liveBoards.open(group.id, today)) {
    // 409 and not 404: this one she can act on, by closing the other tab.
    return new NextResponse("Already drawing", { status: 409 });
  }

  chatBus.publishBoard(group.id, { kind: "open", currentPage: 0 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
