import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { readBoundedBody } from "@/lib/bounded-body";
import {
  dropTrailingEmptyPages,
  foldOps,
  readOps,
  type Op,
} from "@/lib/whiteboard-ops";
import { isThumbnail } from "@/lib/whiteboard-thumbnail";
import { createWhiteboard } from "@/lib/whiteboards";
import { chatBus } from "@/lib/chat-bus";
import { liveBoards } from "@/lib/whiteboard-live";

// A long board is a few hundred strokes of JSON plus a thumbnail. 2MB is
// generous for that and still bounds what one request can make the process
// buffer — Content-Length is a claim, which is why readBoundedBody counts.
const MAX_BOARD_BYTES = 2 * 1024 * 1024;

// A board with more pages than this is a bug or a bored teacher, and every page
// costs a row and a canvas at export time.
const MAX_PAGES = 40;

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
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      cookieStore.get(cookieNameFor(slug))?.value,
    ),
  });
  // chatRole is reused rather than a bare teacher check because it already
  // refuses the everyone group before anything else — which is exactly the
  // rule a whiteboard needs too, and one that should be written once.
  if (role !== "teacher") return new NextResponse("Not found", { status: 404 });

  const text = await readBoundedBody(request, MAX_BOARD_BYTES);
  if (text === null) return new NextResponse("Bad request", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const body = (payload ?? {}) as { ops?: unknown; thumbnail?: unknown };

  if (!isThumbnail(body.thumbnail)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const ops = readOps(body.ops);
  if (ops.length === 0) return new NextResponse("Bad request", { status: 400 });

  // What gets STORED is the log, removes included, so the fold stays reversible
  // and a future change to it applies to old boards too. The fold is only
  // consulted to decide which trailing pages render empty — a page holding
  // nothing but a "clear" is empty to a reader even though its log is not.
  const rendered = foldOps(ops);
  const pageCount = dropTrailingEmptyPages(rendered).length;

  if (pageCount > MAX_PAGES) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const pages: Op[][] = Array.from({ length: pageCount }, () => []);
  for (const op of ops) {
    if (op.page < pageCount) pages[op.page].push(op);
  }

  // Part 1 had no live board and fell back to today. Now a board that was
  // opened before UTC midnight keeps the day it started; the fallback stays for
  // the case where the server restarted mid-board, which /finish still survives
  // because the body is authoritative.
  const live = liveBoards.get(group.id);
  const date =
    live?.date ??
    new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const id = await createWhiteboard({
    groupId: group.id,
    date,
    thumbnail: body.thumbnail,
    pages,
  });

  liveBoards.discard(group.id);
  chatBus.publishBoard(group.id, { kind: "saved" });

  return NextResponse.json({ id }, { status: 201 });
}
