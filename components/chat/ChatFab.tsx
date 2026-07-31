"use client";

import { useCallback, useState } from "react";
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
}: {
  slug: string;
  token: string | null;
  self: "teacher" | "student";
  labels: ChatLabels;
  onDeleteMessage?: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  const onMessages = useCallback(
    (messages: ChatMessage[]) => {
      const fromOther = messages.filter(
        (m) => m.fromTeacher !== (self === "teacher"),
      );
      const newest = fromOther[fromOther.length - 1];
      if (!newest) return;

      if (open) {
        window.localStorage.setItem(seenKey(slug), newest.id);
        setUnseen(false);
      } else {
        setUnseen(window.localStorage.getItem(seenKey(slug)) !== newest.id);
      }
    },
    [open, self, slug],
  );

  return (
    <>
      {open && (
        <ChatWindow
          slug={slug}
          token={token}
          self={self}
          labels={labels}
          onClose={() => setOpen(false)}
          onMessages={onMessages}
          onDeleteMessage={onDeleteMessage}
        />
      )}

      <button
        type="button"
        onClick={() => {
          // Cleared here rather than in an effect watching `open`: this handler
          // is the only thing that ever opens the panel, so an effect would be
          // reacting to a change it already knows about, one render later.
          if (!open) setUnseen(false);
          setOpen(!open);
        }}
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
