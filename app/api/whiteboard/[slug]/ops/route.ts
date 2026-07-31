import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";
import { readOps } from "@/lib/whiteboard-ops";

// One flush is a partial stroke — tens of points. 256KB is far more than that
// and still bounds what a caller can make the process buffer.
const MAX_OPS_BYTES = 256 * 1024;

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

  const text = await readBoundedBody(request, MAX_OPS_BYTES);
  if (text === null) return new NextResponse("Bad request", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = (payload ?? {}) as {
    ops?: unknown;
    pending?: unknown;
    currentPage?: unknown;
  };
  const ops = readOps(body.ops);

  // readOps on a one-element array so `pending` goes through exactly the same
  // validation as a committed op, rather than a second, drifting copy of it.
  const pendingCandidate = readOps([body.pending])[0] ?? null;
  const pending =
    pendingCandidate && pendingCandidate.kind !== "remove"
      ? pendingCandidate
      : null;

  const currentPage =
    typeof body.currentPage === "number" &&
    Number.isInteger(body.currentPage) &&
    body.currentPage >= 0
      ? body.currentPage
      : 0;

  // 409 rather than 404 when no board is open: the client can react by
  // reopening, and it will happen after every deploy mid-lesson.
  if (!liveBoards.append(group.id, ops, currentPage, pending)) {
    return new NextResponse("No board", { status: 409 });
  }

  // Republished from the validated values, not the raw body, so a malformed op
  // never reaches a viewer. Read back from the record rather than reusing the
  // locals, because append() decides whether pending survived.
  const board = liveBoards.get(group.id);
  chatBus.publishBoard(group.id, {
    kind: "ops",
    ops,
    pending: board?.pending ?? null,
    currentPage,
  });

  // 204: the sender already has these ops, and returning them would double
  // every flush.
  return new NextResponse(null, { status: 204 });
}
