import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { createMessage } from "@/lib/messages";
import { parseMessageBody } from "@/lib/chat-body";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  // 404 rather than 403 for a group that exists but refuses: a caller probing
  // slugs learns the same thing either way.
  if (!group) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const teacher = await getCurrentTeacher();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      request.headers
        .get("cookie")
        ?.match(new RegExp(`(?:^|;\\s*)${cookieNameFor(slug)}=([^;]+)`))?.[1],
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = parseMessageBody(
    (payload as { body?: unknown } | null)?.body ?? null,
  );
  if (body === null) return new NextResponse("Bad request", { status: 400 });

  const message = await createMessage(group.id, role === "teacher", body);
  return NextResponse.json(message, { status: 201 });
}
