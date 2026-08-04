"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import type { ChatMessage } from "@/lib/chat-message";
import { cn } from "@/lib/utils";

export function MessageList({
  messages,
  self,
  emptyLabel,
  locale,
  onDeleteMessage,
  deleteLabel,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  emptyLabel: string;
  locale: string;
  onDeleteMessage?: (id: string) => void;
  deleteLabel: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  // Jump to the newest whenever one arrives. A chat that opens at the top of a
  // year of history is a chat nobody scrolls.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--color-ink-muted)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {groupByDay(messages).map((day) => (
        <div key={day.day} className="flex flex-col gap-2">
          <div className="text-center text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]">
            {new Date(`${day.day}T00:00:00Z`).toLocaleDateString(locale, {
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </div>

          {day.messages.map((message) => {
            const mine =
              (self === "teacher") === message.fromTeacher;
            return (
              <div
                key={message.id}
                className={cn(
                  "group/msg flex max-w-[85%] items-center gap-1",
                  mine ? "flex-row-reverse self-end" : "self-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    mine
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-field)] text-[var(--color-ink)]",
                  )}
                >
                  {message.body}
                </div>
                {onDeleteMessage && (
                  <button
                    type="button"
                    onClick={() => onDeleteMessage(message.id)}
                    aria-label={`${deleteLabel}: ${message.body.slice(0, 40)}`}
                    className="text-xs text-[var(--color-ink-muted)] opacity-0 transition-opacity group-hover/msg:opacity-100 focus:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
