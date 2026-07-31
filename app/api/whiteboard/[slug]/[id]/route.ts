import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { getWhiteboardScene } from "@/lib/whiteboards";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  // Either role may read a board: the student owns it as much as she does.
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  const scene = await getWhiteboardScene(group.id, id);
  if (!scene) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(
    { pages: scene },
    // A saved board never changes, so it is safe to cache privately — but
    // never publicly: this response is scoped to one student's token.
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
