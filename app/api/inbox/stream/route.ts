import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatBus, type BoardFrame } from "@/lib/chat-bus";
import { messagesAfterAll, type StoredMessage } from "@/lib/messages";
import { liveBoards } from "@/lib/whiteboard-live";

// Without this Next may try to evaluate the handler at build time, which for a
// stream that never ends means a build that never finishes.
export const dynamic = "force-dynamic";

// Same 20s as the per-slug stream, and for the same reason: nginx's
// proxy_read_timeout is 60s by default and would drop a quiet inbox.
const HEARTBEAT_MS = 20_000;

// NOT under /api/chat/. A static `stream` segment there would take routing
// precedence over app/api/chat/[slug]/, silently shadowing a student whose name
// produced the slug "stream".
//
// Like lib/chat-bus.ts and lib/whiteboard-live.ts, this is correct ONLY because
// pm2 runs this app as a single process in fork mode. Under cluster mode a
// message would reach only the viewers on the same worker, silently. This is
// now the third feature depending on that — see docs/DEPLOYMENT.md.
export async function GET(request: Request) {
  // 404 rather than 403, matching every other route here: a caller probing
  // learns the same thing either way.
  const teacher = await getCurrentTeacher();
  if (!teacher) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);
  const boardSlug = url.searchParams.get("board");

  // Fetched once at connect so the filter in send() is a comparison rather than
  // a query per message.
  const everyone = await prisma.group.findFirst({
    where: { isEveryone: true },
    select: { id: true },
  });

  // Optional, and a missing or unknown slug is NOT a 404: the inbox is the
  // point of this stream and it has to open on /admin, where there is no
  // student page and so no board.
  const boardGroup = boardSlug
    ? await prisma.group.findUnique({
        where: { slug: boardSlug },
        select: { id: true, isEveryone: true },
      })
    : null;
  const boardGroupId =
    boardGroup && !boardGroup.isEveryone ? boardGroup.id : null;

  const lastEventId = request.headers.get("last-event-id");

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let unsubscribeBoard = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  // Safe to call more than once: EventEmitter.off and clearInterval both
  // tolerate being called after the listener/timer is already gone.
  const teardown = () => {
    unsubscribe();
    unsubscribeBoard();
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: StoredMessage) => {
        // No message can exist for the everyone group — chatRole refuses the
        // POST route first — but the stream mirrors the access rule rather than
        // assuming the other end enforced it. Same defensive contract as
        // readSections, readOps and readPageKind.
        if (everyone && message.groupId === everyone.id) return;
        try {
          // The id: line is what the browser sends back as Last-Event-ID.
          controller.enqueue(
            encoder.encode(
              `id: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`,
            ),
          );
        } catch {
          // The connection died between its close and our teardown callback
          // firing. Swallowing this matters: publish() is synchronous inside
          // the SENDER's request, so an exception here would surface as a 500
          // on someone else's message — one that was already saved.
          teardown();
        }
      };

      // NO id: line, and a named event — the same two properties the per-slug
      // stream relies on. An event without an id leaves the client's
      // last-event-id buffer untouched, so ephemeral board traffic cannot
      // corrupt the message replay anchor; and onmessage fires only for unnamed
      // events, so the message handler cannot see these.
      const sendBoard = (frame: BoardFrame) => {
        try {
          controller.enqueue(
            encoder.encode(`event: board\ndata: ${JSON.stringify(frame)}\n\n`),
          );
        } catch {
          teardown();
        }
      };

      // Subscribed BEFORE the replay is read, with anything arriving in between
      // held back: subscribing afterwards leaves a window the width of a
      // database round trip in which a message reaches neither path.
      const pending: StoredMessage[] = [];
      let replaying = true;
      unsubscribe = chatBus.subscribeAll((message) => {
        if (replaying) pending.push(message);
        else send(message);
      });

      const pendingBoard: BoardFrame[] = [];
      let replayingBoard = true;
      if (boardGroupId) {
        unsubscribeBoard = chatBus.subscribeBoard(boardGroupId, (frame) => {
          if (replayingBoard) pendingBoard.push(frame);
          else sendBoard(frame);
        });
      }

      // No first-connect backlog, unlike the per-slug stream. That route
      // replays one conversation, which is right. This one would replay every
      // conversation Jenn has ever had, on every admin page load, forever. The
      // list comes down with the page; a selected conversation loads its own
      // history through loadConversation.
      //
      // A reconnect still replays, bounded by how long she was disconnected, so
      // a deploy mid-lesson costs a blink rather than a message.
      const backlog = lastEventId ? await messagesAfterAll(lastEventId) : [];
      for (const message of backlog) send(message);

      replaying = false;
      const seen = new Set(backlog.map((message) => message.id));
      for (const message of pending) {
        if (!seen.has(message.id)) send(message);
      }

      // A teacher who opens a student's page mid-board must see the whole
      // thing, not the tail — the same idea as the per-slug route, pointed at
      // the same in-memory log.
      if (boardGroupId) {
        const live = liveBoards.get(boardGroupId);
        if (live) {
          sendBoard({
            kind: "ops",
            ops: live.ops,
            pending: live.pending,
            currentPage: live.currentPage,
          });
        }
      }

      replayingBoard = false;
      for (const frame of pendingBoard) sendBoard(frame);

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          teardown();
        }
      }, HEARTBEAT_MS);

      // A closed tab does not run cancel() in every runtime; the request's
      // abort signal is the reliable teardown.
      request.signal.addEventListener("abort", teardown);
    },

    cancel() {
      teardown();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold the whole
      // stream in memory and deliver nothing.
      "X-Accel-Buffering": "no",
    },
  });
}
