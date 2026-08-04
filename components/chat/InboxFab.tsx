"use client";

import { useEffect, useRef, useState } from "react";
import { useStream } from "@/components/StreamProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  Conversation,
  type ConversationLabels,
} from "@/components/chat/Conversation";
import {
  ConversationList,
  type ConversationListLabels,
} from "@/components/chat/ConversationList";
import {
  UnclaimedNotice,
  type UnclaimedLabels,
} from "@/components/chat/UnclaimedNotice";
import { Fab } from "@/components/ui/Fab";
import { messagesFor } from "@/lib/chat-select";
import type { ConversationSummary } from "@/lib/inbox";
import type { ChatMessage } from "@/lib/chat-message";

export type InboxLabels = ConversationLabels &
  ConversationListLabels &
  UnclaimedLabels & {
    title: string;
    close: string;
    back: string;
    // Shown in the right pane at desktop size when nothing is selected yet.
    // Unreachable below md, where an unselected inbox shows the list instead.
    pickOne: string;
  };

export function InboxFab({
  conversations,
  initialSelectedId,
  labels,
  onLoadConversation,
  onMarkRead,
  onDeleteMessage,
  onInviteLink,
}: {
  conversations: ConversationSummary[];
  // Set when she is standing on a student's page, so opening the FAB there
  // lands in that conversation rather than on a list she has to search.
  initialSelectedId: string | null;
  labels: InboxLabels;
  onLoadConversation: (groupId: string) => Promise<ChatMessage[]>;
  onMarkRead: (groupId: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onInviteLink: (groupId: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  // Mobile only — at md both panes are visible and ChatPanel ignores this.
  const [view, setView] = useState<"list" | "conversation">(
    initialSelectedId ? "conversation" : "list",
  );
  const [unread, setUnread] = useState(
    () => new Map(conversations.map((c) => [c.groupId, c.unread])),
  );

  const { messages, ingest, removeMessage } = useStream();

  // Every message id this component has already decided about, so a re-render
  // cannot count the same message twice. Seeded with fetched history BEFORE it
  // is ingested — otherwise loading a conversation would count every old
  // message in it as newly arrived.
  const counted = useRef(new Set<string>());
  // Conversations whose history is loaded, and those with a load in flight, so
  // a double-click does not fetch twice.
  const loaded = useRef(new Set<string>());
  const loading = useRef(new Set<string>());

  // The unread effect below runs on every message change and must see the
  // CURRENT open/selected state, not the values captured when it was scheduled.
  const openRef = useRef(open);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    for (const message of messages) {
      if (message.fromTeacher) continue;
      if (counted.current.has(message.id)) continue;
      counted.current.add(message.id);

      const reading =
        openRef.current && selectedRef.current === message.groupId;
      if (reading) {
        // Read on arrival: one small UPDATE per message she is looking at. That
        // is the correct cost for a two-person tutoring app, and the
        // alternative — stamping only on open and close — leaves the dot up on
        // a conversation she is actively reading.
        void onMarkRead(message.groupId);
        continue;
      }

      setUnread((current) => {
        const next = new Map(current);
        next.set(message.groupId, (next.get(message.groupId) ?? 0) + 1);
        return next;
      });
    }
  }, [messages, onMarkRead]);

  async function select(groupId: string) {
    setSelectedId(groupId);
    setView("conversation");
    setUnread((current) => new Map(current).set(groupId, 0));
    // Fire and forget: a failure to stamp "read" must not stop the conversation
    // from opening.
    void onMarkRead(groupId);

    if (loaded.current.has(groupId) || loading.current.has(groupId)) return;
    loading.current.add(groupId);
    try {
      const history = await onLoadConversation(groupId);
      // Before ingest, not after: the effect above runs on the resulting state
      // change and would otherwise treat a year of history as new arrivals.
      for (const message of history) counted.current.add(message.id);
      ingest(history);
      loaded.current.add(groupId);
    } catch {
      // Deliberately left unloaded so re-selecting retries. The empty state is
      // wrong but recoverable; a permanently blank conversation is not.
    } finally {
      loading.current.delete(groupId);
    }
  }

  function toggle() {
    if (!open && selectedId) void select(selectedId);
    setOpen(!open);
  }

  async function send(body: string) {
    const selected = conversations.find((c) => c.groupId === selectedId);
    if (!selected) return;
    // No ?k= — chatRole reads her session and answers "teacher" without one,
    // which is why this FAB works on a student page she has no token for.
    const response = await fetch(`/api/chat/${selected.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing appended here — it arrives back through the stream, which is what
    // gives it its real id and timestamp.
  }

  // The SSE stream only ever carries insertions, so a delete has to be
  // reflected locally by hand — nothing else will tell this client it is gone.
  async function handleDelete(id: string) {
    await onDeleteMessage(id);
    removeMessage(id);
  }

  const selected = conversations.find((c) => c.groupId === selectedId) ?? null;
  const anyUnread = [...unread.values()].some((count) => count > 0);

  return (
    <>
      {/* Conditionally rendered, and load-bearing: everything inside formats
          dates in the reader's timezone, so an SSR pass would mismatch on
          hydration. See the note at the top of MessageList. */}
      {open && (
        <ChatPanel
          title={selected ? selected.name : labels.title}
          labels={{ close: labels.close, back: labels.back }}
          onClose={() => setOpen(false)}
          // Only when there is somewhere to go back to. ChatPanel hides it at
          // md, where both panes are on screen at once.
          onBack={view === "conversation" ? () => setView("list") : undefined}
          showAside={view === "list"}
          aside={
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              unread={unread}
              onSelect={(id) => void select(id)}
              labels={labels}
            />
          }
        >
          {selected ? (
            <Conversation
              messages={messagesFor(messages, selected.groupId)}
              self="teacher"
              labels={labels}
              // Both omitted for an unclaimed student: the thread stays
              // readable and there is nothing to type into, because nobody has
              // claimed the other end of it. Deleting is withheld for the same
              // reason it is offered at all — it is a control over a live
              // conversation, and this is not one yet.
              onSend={selected.claimed ? send : undefined}
              onDeleteMessage={selected.claimed ? handleDelete : undefined}
              footer={
                selected.claimed ? undefined : (
                  <UnclaimedNotice
                    // Keyed so switching between two unclaimed students
                    // refetches rather than showing the first one's invite.
                    key={selected.groupId}
                    groupId={selected.groupId}
                    name={selected.name}
                    labels={labels}
                    onInviteLink={onInviteLink}
                  />
                )
              }
            />
          ) : (
            // Only reachable at md and up, where the list is beside this pane.
            // Below md an unselected inbox shows the list full-screen instead.
            <p className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--color-ink-muted)]">
              {labels.pickOne}
            </p>
          )}
        </ChatPanel>
      )}

      <Fab
        label={labels.title}
        expanded={open}
        onClick={toggle}
        className="bottom-6 right-4"
        badge={
          anyUnread && !open ? (
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
