"use client";

import { useState } from "react";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { orderConversations } from "@/lib/inbox-order";
import { previewText } from "@/lib/chat-preview";
import { listStamp } from "@/lib/chat-stamp";
import type { ConversationSummary } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export type ConversationListLabels = {
  search: string;
  noStudents: string;
  noMatch: string;
  noMessages: string;
  // The preview line for a student who has not signed up yet. Listed rather
  // than hidden: a student Jenn created ten seconds ago being absent from her
  // inbox with no explanation reads as a bug.
  notSignedUp: string;
  you: string;
  yesterday: string;
  unread: string;
  locale: string;
};

// Renders only inside an open panel — listStamp resolves in the reader's
// timezone and an SSR pass would produce different HTML. See MessageList.
export function ConversationList({
  conversations,
  selectedId,
  unread,
  onSelect,
  labels,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  // Live, client-side unread counts. Seeded from ConversationSummary.unread and
  // then moved by the stream, which is why it is a separate map rather than a
  // field read off the summary — the summary is a server snapshot and does not
  // change until the page reloads.
  unread: Map<string, number>;
  onSelect: (groupId: string) => void;
  labels: ConversationListLabels;
}) {
  const [query, setQuery] = useState("");

  // Ordered before filtering, so a search never reorders what is left.
  const visible = filterGroups(orderConversations(conversations), query);

  // Read during render so a panel left open across midnight still says the
  // right thing. Safe here only because this never renders on the server.
  const now = new Date();

  if (conversations.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--color-ink-muted)]">
        {labels.noStudents}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <SearchField label={labels.search} value={query} onChange={setQuery} />
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-2 text-center text-sm text-[var(--color-ink-muted)]">
          {labels.noMatch}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {visible.map((conversation) => {
            const count = unread.get(conversation.groupId) ?? 0;
            const selected = conversation.groupId === selectedId;
            return (
              <li key={conversation.groupId}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.groupId)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                    selected
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-[var(--color-field)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {count > 0 && (
                      <span
                        // A dot, not a number: the count is on the Students tab
                        // and this list answers "who", not "how many".
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-[var(--card-rouge)]"
                      />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate text-sm text-[var(--color-ink)]",
                        count > 0 && "font-semibold",
                      )}
                    >
                      {conversation.name}
                    </span>
                    {count > 0 && (
                      // The dot is aria-hidden, so the unread state reaches a
                      // screen reader here instead.
                      <span className="sr-only">{labels.unread}</span>
                    )}
                    {conversation.lastMessage && (
                      <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">
                        {listStamp(
                          conversation.lastMessage.createdAt,
                          now,
                          labels.locale,
                          { yesterday: labels.yesterday },
                        )}
                      </span>
                    )}
                  </span>

                  <span className="truncate text-xs text-[var(--color-ink-muted)]">
                    {previewText(conversation.lastMessage, {
                      you: labels.you,
                      // Only reached when there is no last message, so an
                      // unclaimed student who DOES have history — Jenn could
                      // have written to them under the old model — still shows
                      // that history here.
                      empty: conversation.claimed
                        ? labels.noMessages
                        : labels.notSignedUp,
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
