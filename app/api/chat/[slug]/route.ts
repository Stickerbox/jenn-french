import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { createMessage } from "@/lib/messages";
import { parseMessageBody } from "@/lib/chat-body";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";

// A message is capped at MAX_MESSAGE_LENGTH characters, but that check runs
// after parsing. This bounds what a caller can make the process buffer in the
// first place, with room for JSON syntax and multi-byte UTF-8.
const MAX_CHAT_BYTES = 16 * 1024;

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
  const cookieStore = await cookies();
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    // Read through the cookie API rather than parsing the header by hand: the
    // slug is unvalidated teacher input and interpolating it into a RegExp
    // made a slug like "a(b" a 500 on every request to that chat.
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  const text = await readBoundedBody(request, MAX_CHAT_BYTES);
  if (text === null) return new NextResponse("Bad request", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
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
