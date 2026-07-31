"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};

export function MessageList({
  messages,
  self,
  emptyLabel,
  locale,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  emptyLabel: string;
  locale: string;
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
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  mine
                    ? "self-end bg-[var(--color-accent)] text-white"
                    : "self-start bg-[var(--color-field)] text-[var(--color-ink)]",
                )}
              >
                {message.body}
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
