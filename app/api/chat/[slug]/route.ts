import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { createMessage } from "@/lib/messages";
import { parseMessageBody } from "@/lib/chat-body";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";
import { addChatLinks } from "@/lib/shelf-links";

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

  // After the write, never before — the ordering rule createMessage states
  // about chatBus.publish, for the same reason: nothing observable may exist
  // for a message the database did not store.
  //
  // Awaited rather than floated. It is one indexed findFirst and one insert
  // against a local SQLite file, and revalidatePath after the response has gone
  // out does nothing at all.
  //
  // The everyone group needs no clause here: chatRole refused it above, before
  // it checked anything else, so no auto-shelved link can ever reach the shared
  // shelf.
  try {
    const added = await addChatLinks({
      groupId: group.id,
      body,
      fromTeacher: role === "teacher",
    });

    if (added.length > 0) {
      // revalidatePages in app/page-actions.ts is the list these three
      // duplicate, and it CANNOT be imported: that file is "use server", so
      // every export from it becomes a callable server action endpoint.
      // /p/[slug] is absent from the list because a link row has no page to
      // serve, and /admin/pages/[slug] because it 404s on one.
      revalidatePath("/g/[slug]", "page");
      revalidatePath("/f/[token]", "page");
      revalidatePath("/admin");
    }
  } catch {
    // addChatLinks does not throw; this is the belt to its braces, guarding the
    // same invariant — a shelf write may never fail a message send.
  }

  return NextResponse.json(message, { status: 201 });
}
