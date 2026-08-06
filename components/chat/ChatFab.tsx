"use client";

import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  Conversation,
  type ConversationLabels,
} from "@/components/chat/Conversation";
import { Fab } from "@/components/ui/Fab";
import { useStream } from "@/components/StreamProvider";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

// Per-device by design: the student has no account to hang a read marker on,
// and tracking it server-side would mean a write path from an unauthenticated
// visitor for the sake of a dot.
const seenKey = (slug: string) => `chat-seen:${slug}`;

// The exact shape app/g/[slug]/page.tsx builds by hand today — a route this
// task does not own. It is deliberately NARROWER than ConversationLabels:
// reply/cancelReply are filled in below from labels.locale instead of being
// threaded in from that caller, so this type does not gain a field the
// existing call site would then be missing.
export type StudentChatLabels = {
  empty: string;
  locale: string;
  today: string;
  deleteMessage: string;
  placeholder: string;
  send: string;
  title: string;
  close: string;
  back: string;
};

// The student's side only. Jenn's FAB is components/chat/InboxFab.tsx — she has
// a list of conversations and this has exactly one, so they are two components
// rather than one with a mode flag. That split is what let `self`, `token`,
// `onOpen` and `onDeleteMessage` go: all four existed to serve the teacher.
export function ChatFab({
  slug,
  labels,
  locale,
}: {
  slug: string;
  labels: StudentChatLabels;
  // The locale itself, not the resolved dictionary — see getStrings below.
  // `labels.locale` is a BCP-47 tag for Intl and is a different thing.
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  // The connection itself lives in StreamProvider: the whiteboard needs the
  // same stream, and two EventSources would each replay the whole chat backlog
  // from the database at connect.
  const { messages } = useStream();

  // The unread effect below closes over `open` from the render that ran it.
  // Reading it through a ref keeps that check current without making the
  // effect re-run every time the panel toggles.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // The newest message from the other party — always Jenn now that this
  // component is the student's alone — compared against the last one this
  // device saw.
  useEffect(() => {
    const fromTeacher = messages.filter((m) => m.fromTeacher);
    const newest = fromTeacher[fromTeacher.length - 1];
    if (!newest) return;

    if (openRef.current) {
      window.localStorage.setItem(seenKey(slug), newest.id);
      setUnseen(false);
    } else {
      setUnseen(window.localStorage.getItem(seenKey(slug)) !== newest.id);
    }
  }, [messages, slug]);

  async function send(body: string, replyToId: string | null) {
    const response = await fetch(`/api/chat/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, replyTo: replyToId }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing is appended here — the message arrives back through the stream,
    // which is also what gives it its real id and timestamp.
  }

  // The two strings the caller's label object does not carry. It is the
  // LOCALE that crosses, never the resolved Strings object — lib/strings.ts
  // holds interpolating functions, React cannot serialize a function across
  // the server/client boundary, and passing the object threw a 500 at runtime
  // while lint, tsc, the tests and the build all stayed green.
  const chatStrings = getStrings(locale).chat;
  const conversationLabels: ConversationLabels = {
    ...labels,
    reply: chatStrings.reply,
    cancelReply: chatStrings.cancelReply,
  };

  function handleToggle() {
    if (!open) {
      // Cleared here rather than in an effect watching `open`: this handler
      // is the only thing that ever opens the panel, so an effect would be
      // reacting to a change it already knows about, one render later.
      setUnseen(false);
      const fromTeacher = messages.filter((m) => m.fromTeacher);
      const newest = fromTeacher[fromTeacher.length - 1];
      if (newest) window.localStorage.setItem(seenKey(slug), newest.id);
    }
    setOpen(!open);
  }

  return (
    <>
      {/* Conditionally rendered, and that is load-bearing rather than an
          optimisation: everything inside formats dates in the reader's
          timezone, so rendering it during SSR would be a hydration mismatch.
          See the note at the top of MessageList. */}
      {open && (
        <ChatPanel
          title={labels.title}
          labels={{ close: labels.close, back: labels.back }}
          onClose={() => setOpen(false)}
        >
          {/* messages passed straight through rather than through messagesFor:
              a student's stream carries one conversation, so filtering would
              be a no-op that implies otherwise. */}
          <Conversation
            messages={messages}
            self="student"
            labels={conversationLabels}
            onSend={send}
          />
        </ChatPanel>
      )}

      <Fab
        label={labels.title}
        expanded={open}
        onClick={handleToggle}
        className="bottom-6 right-4"
        badge={
          unseen && !open ? (
            <span
              aria-hidden="true"
              className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--card-rouge)]"
            />
          ) : undefined
        }
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-9 8.38 8.38 0 0 1 8.6 8.5Z" />
        </svg>
      </Fab>
    </>
  );
}
