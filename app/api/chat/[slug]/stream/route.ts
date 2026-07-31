import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole } from "@/lib/chat-access";
import { chatBus } from "@/lib/chat-bus";
import { listMessages, messagesAfter, type StoredMessage } from "@/lib/messages";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

// Without this Next may try to evaluate the handler at build time, which for a
// stream that never ends means a build that never finishes.
export const dynamic = "force-dynamic";

// Nginx's proxy_read_timeout is 60s by default and would drop a lesson that
// went quiet. A comment line every 20s is invisible to EventSource and keeps
// the connection counted as live.
const HEARTBEAT_MS = 20_000;

export async function GET(
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
  const role = chatRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      url.searchParams.get("k") ?? undefined,
      // Read through the cookie API rather than parsing the header by hand:
      // the slug is unvalidated teacher input, and interpolating it into a
      // RegExp made a slug like "a(b" an uncaught 500 on every request.
      (await cookies()).get(cookieNameFor(slug))?.value,
    ),
  });
  if (!role) return new NextResponse("Not found", { status: 404 });

  const lastEventId = request.headers.get("last-event-id");

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let unsubscribeRevoke = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  // Safe to call more than once: EventEmitter.off and clearInterval both
  // tolerate being called after the listener/timer is already gone.
  const teardown = () => {
    unsubscribe();
    unsubscribeRevoke();
    if (heartbeat) clearInterval(heartbeat);
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (message: StoredMessage) => {
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

      // Subscribed BEFORE the backlog is read, with anything that arrives in
      // between held back: subscribing afterwards leaves a window the width of
      // a database round trip in which a message reaches neither path and is
      // not seen again until the client next reconnects.
      const pending: StoredMessage[] = [];
      let replaying = true;
      unsubscribe = chatBus.subscribe(group.id, (message) => {
        if (replaying) pending.push(message);
        else send(message);
      });

      // A token check only happens at connect, so a link regenerated after
      // this stream opened would otherwise relay forever on the old token.
      // Closing the connection here is what forces the client to reconnect —
      // and re-authenticate against the new token — instead of quietly
      // keeping a leaked link alive until it happens to drop on its own.
      unsubscribeRevoke = chatBus.subscribeRevoke(group.id, () => {
        teardown();
        try {
          controller.close();
        } catch {
          // Already closed by the client or another teardown path.
        }
      });

      // EventSource resends the last id it saw after a dropped connection. Replay
      // from there so a deploy mid-lesson costs a blink rather than a message.
      const backlog = lastEventId
        ? await messagesAfter(group.id, lastEventId)
        : await listMessages(group.id);
      for (const message of backlog) send(message);

      replaying = false;
      const seen = new Set(backlog.map((message) => message.id));
      for (const message of pending) {
        if (!seen.has(message.id)) send(message);
      }

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
      // stream in memory and deliver nothing. This turns buffering off for
      // this response alone — no server-side nginx change is needed.
      "X-Accel-Buffering": "no",
    },
  });
}
