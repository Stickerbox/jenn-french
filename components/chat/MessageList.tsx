"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import { dayHeading } from "@/lib/chat-stamp";
import { formatTime, localDayKey } from "@/lib/chat-time";
import type { ChatMessage } from "@/lib/chat-message";
import { cn } from "@/lib/utils";

export type MessageListLabels = {
  empty: string;
  locale: string;
  today: string;
  deleteMessage: string;
};

// NEVER RENDERED ON THE SERVER. Every heading and every timestamp below is
// resolved in the runtime's timezone — UTC on the box, the reader's zone in the
// browser — so an SSR pass would produce different HTML from the hydration pass
// and React would throw. What protects it is that the panel holding it is
// mounted on an `open` state that starts false, so it does not exist until
// after mount. Anything that renders this eagerly breaks production only.
export function MessageList({
  messages,
  self,
  labels,
  onDeleteMessage,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: MessageListLabels;
  onDeleteMessage?: (id: string) => void;
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
        {labels.empty}
      </p>
    );
  }

  // Read during render rather than held in state: "today" has to be right for a
  // panel left open across midnight, and this component re-renders on every
  // message anyway. Safe to call here only because of the no-SSR rule above.
  const todayKey = localDayKey(new Date());

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {groupByDay(messages).map((day) => (
        <div key={day.day} className="flex flex-col gap-2">
          {/* Sticky inside its own day group, not inside the scroll container:
              that is what makes a heading scroll away when its day ends
              instead of stacking under the next one. */}
          <div className="sticky top-0 z-10 flex justify-center py-1">
            <span className="rounded-full bg-[var(--color-bg)]/90 px-3 py-0.5 text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)] backdrop-blur-sm">
              {dayHeading(
                day.day,
                todayKey,
                { today: labels.today },
                labels.locale,
              )}
            </span>
          </div>

          {day.messages.map((message) => {
            const mine = (self === "teacher") === message.fromTeacher;
            return (
              <div
                key={message.id}
                className={cn(
                  "group/msg flex max-w-[85%] flex-col gap-0.5",
                  mine ? "self-end items-end" : "self-start items-start",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1",
                    mine && "flex-row-reverse",
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
                      aria-label={`${labels.deleteMessage}: ${message.body.slice(0, 40)}`}
                      className="text-xs text-[var(--color-ink-muted)] opacity-0 transition-opacity group-hover/msg:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* dateTime carries the instant, so the machine-readable value
                    is unambiguous even though the visible one is local. */}
                <time
                  dateTime={message.createdAt.toISOString()}
                  className="px-1.5 text-[11px] text-[var(--color-ink-muted)]"
                >
                  {formatTime(message.createdAt, labels.locale)}
                </time>
              </div>
            );
          })}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
