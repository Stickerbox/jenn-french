"use client";

import { useEffect, useRef, useState } from "react";
import { ChatWindow, type ChatLabels } from "@/components/chat/ChatWindow";
import type { ChatMessage } from "@/components/chat/MessageList";

// Per-device by design: the student has no account to hang a read marker on,
// and tracking it server-side would mean a write path from an unauthenticated
// visitor for the sake of a dot.
const seenKey = (slug: string) => `chat-seen:${slug}`;

export function ChatFab({
  slug,
  token,
  self,
  labels,
  onDeleteMessage,
  onOpen,
}: {
  slug: string;
  token: string | null;
  self: "teacher" | "student";
  labels: ChatLabels;
  onDeleteMessage?: (id: string) => Promise<void>;
  onOpen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // The onmessage handler below is set up once per mount (see the effect's
  // deps) and closes over `open` from that render. Reading it through a ref
  // keeps the handler current without tearing down and reopening the
  // connection every time the panel toggles.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const query = token ? `?k=${encodeURIComponent(token)}` : "";

  // Opened on mount and held open for as long as this component is mounted —
  // not just while the panel is open. The unread dot can only ever reflect a
  // message this component actually observed, so a stream that closes with
  // the panel would make the dot dead code, which is the bug this fixes: one
  // connection per open student page is what makes an unread marker possible
  // without server-side read state.
  useEffect(() => {
    const source = new EventSource(`/api/chat/${slug}/stream${query}`);

    source.onmessage = (event) => {
      const raw = JSON.parse(event.data) as ChatMessage & {
        createdAt: string;
      };
      const message = { ...raw, createdAt: new Date(raw.createdAt) };

      setMessages((current) =>
        // De-duplicated by id because a reconnect replays, and because the
        // sender receives its own message back through the stream.
        current.some((m) => m.id === message.id)
          ? current
          : [...current, message],
      );

      if (message.fromTeacher === (self === "teacher")) return; // own message
      if (openRef.current) {
        window.localStorage.setItem(seenKey(slug), message.id);
        setUnseen(false);
      } else {
        setUnseen(window.localStorage.getItem(seenKey(slug)) !== message.id);
      }
    };

    return () => source.close();
  }, [slug, query, self]);

  async function send(body: string) {
    const response = await fetch(`/api/chat/${slug}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing is appended here — the message arrives back through the stream,
    // which is also what gives it its real id and timestamp.
  }

  // The SSE stream only ever carries insertions, so a delete has to be
  // reflected locally by hand — nothing else will tell this client the
  // message is gone.
  async function handleDeleteMessage(id: string) {
    if (!onDeleteMessage) return;
    await onDeleteMessage(id);
    setMessages((current) => current.filter((m) => m.id !== id));
  }

  function handleToggle() {
    if (!open) {
      // Cleared here rather than in an effect watching `open`: this handler
      // is the only thing that ever opens the panel, so an effect would be
      // reacting to a change it already knows about, one render later.
      setUnseen(false);
      const fromOther = messages.filter(
        (m) => m.fromTeacher !== (self === "teacher"),
      );
      const newest = fromOther[fromOther.length - 1];
      if (newest) window.localStorage.setItem(seenKey(slug), newest.id);
      // Fire and forget: a failure to stamp "read" must not stop the panel
      // from opening, and the caller (only the admin page passes this) has
      // nothing useful to do with the result.
      void onOpen?.();
    }
    setOpen(!open);
  }

  return (
    <>
      {open && (
        <ChatWindow
          self={self}
          labels={labels}
          messages={messages}
          onSend={send}
          onClose={() => setOpen(false)}
          onDeleteMessage={onDeleteMessage ? handleDeleteMessage : undefined}
        />
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={labels.title}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition-opacity hover:opacity-90"
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
        {unseen && !open && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--card-rouge)]"
          />
        )}
      </button>
    </>
  );
}
