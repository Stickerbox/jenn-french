"use client";

import { useEffect, useRef } from "react";
import { groupByDay } from "@/lib/chat-day";
import { groupIntoRuns } from "@/lib/chat-run";
import { dayHeading } from "@/lib/chat-stamp";
import { formatTime, localDayKey } from "@/lib/chat-time";
import { linkifyBody } from "@/lib/chat-linkify";
import type { ChatMessage } from "@/lib/chat-message";
import { cn } from "@/lib/utils";
import { accentFocusRing } from "@/components/ui/field";

export type MessageListLabels = {
  empty: string;
  locale: string;
  today: string;
  deleteMessage: string;
  reply: string;
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
  onReply,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: MessageListLabels;
  onDeleteMessage?: (id: string) => void;
  // Optional for the same reason onDeleteMessage is: a read-only thread (an
  // unclaimed student's footer replaces the composer entirely) has nothing to
  // reply into.
  onReply?: (message: ChatMessage) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  // Jump to the newest whenever one arrives. A chat that opens at the top of a
  // year of history is a chat nobody scrolls.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-[var(--color-ink-muted)]/50"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-9 8.38 8.38 0 0 1 8.6 8.5Z" />
        </svg>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {labels.empty}
        </p>
      </div>
    );
  }

  // Read during render rather than held in state: "today" has to be right for a
  // panel left open across midnight, and this component re-renders on every
  // message anyway. Safe to call here only because of the no-SSR rule above.
  const todayKey = localDayKey(new Date());

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      {groupByDay(messages).map((day) => (
        <div key={day.day} className="flex flex-col gap-3">
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

          {/* Runs, not raw messages: groupIntoRuns collapses a burst from one
              sender into one visual block with one timestamp, the shape a
              tutoring conversation actually has. It runs inside this day
              group, so groupByDay still owns the date separators. */}
          <div className="flex flex-col gap-4">
            {groupIntoRuns(day.messages).map((run) => {
              const mine = (self === "teacher") === run.fromTeacher;
              const last = run.messages[run.messages.length - 1];
              return (
                <div
                  key={run.messages[0].id}
                  className={cn(
                    "flex max-w-[85%] flex-col gap-0.5",
                    mine ? "self-end items-end" : "self-start items-start",
                  )}
                >
                  {run.messages.map((message, i) => {
                    const isLast = i === run.messages.length - 1;
                    return (
                      <div
                        key={message.id}
                        // Unconditional, on the keyed element: the animation
                        // plays once when this node is inserted and does not
                        // replay on a re-render, since the class string never
                        // changes. Only a genuinely new message mounts a new
                        // node.
                        className={cn(
                          "group/msg flex items-center gap-1 animate-[bubble-in_180ms_ease-out] motion-reduce:animate-none",
                          mine && "flex-row-reverse",
                        )}
                      >
                        {message.automated ? (
                          // An automated message is never linkified: its body
                          // no longer carries a URL to find (see
                          // lib/version-notice.ts) — the bubble IS the link,
                          // via href, which is why this branch skips
                          // linkifyBody entirely rather than running it over
                          // prose that has nothing for it to match.
                          message.href ? (
                            <a
                              href={message.href}
                              // Same-origin (a worksheet route on this site),
                              // so no target="_blank" and no rel gymnastics —
                              // a same-tab navigation carries no opener to
                              // guard against.
                              className={cn(
                                "flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm italic leading-relaxed transition-colors duration-150 motion-reduce:transition-none",
                                mine
                                  ? "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90"
                                  : "bg-[var(--color-field)] text-[var(--color-ink)] hover:bg-[var(--color-field-border)]/60",
                                isLast &&
                                  (mine ? "rounded-br-md" : "rounded-bl-md"),
                                accentFocusRing,
                              )}
                            >
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                                {message.body}
                              </span>
                              {/* Trailing chevron: the only visual cue this
                                  whole bubble navigates, since there is no
                                  underlined URL text left to read as a link. */}
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 opacity-80"
                              >
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                            </a>
                          ) : (
                            // href is nullable on the column even though
                            // nothing here currently creates a hrefless
                            // automated message — a plain, non-clickable
                            // bubble rather than a dead anchor is the correct
                            // degrade if one ever exists.
                            <div
                              className={cn(
                                "rounded-2xl px-4 py-2.5 text-sm italic leading-relaxed whitespace-pre-wrap break-words",
                                mine
                                  ? "bg-[var(--color-accent)] text-white"
                                  : "bg-[var(--color-field)] text-[var(--color-ink)]",
                                isLast &&
                                  (mine ? "rounded-br-md" : "rounded-bl-md"),
                              )}
                            >
                              {message.body}
                            </div>
                          )
                        ) : (
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                              mine
                                ? "bg-[var(--color-accent)] text-white"
                                : "bg-[var(--color-field)] text-[var(--color-ink)]",
                              // The bubble tail every messenger uses, without an
                              // SVG: only the corner nearest the run's tail
                              // squares off, and only on the last bubble of the
                              // run.
                              isLast &&
                                (mine ? "rounded-br-md" : "rounded-bl-md"),
                            )}
                          >
                            {message.replyTo && (
                              // Visually subordinate to the reply's own text
                              // below it: smaller, dimmed, clamped to two
                              // lines. Null both when there is no quote and
                              // when the quoted row was deleted (replyToId
                              // SetNull) — either way there is nothing to
                              // draw, so this reply's own text still stands
                              // alone.
                              <div
                                className={cn(
                                  "mb-1.5 line-clamp-2 border-l-2 pl-2 text-xs opacity-80",
                                  mine
                                    ? "border-white/50"
                                    : "border-[var(--color-accent)]/50",
                                )}
                              >
                                {message.replyTo.body}
                              </div>
                            )}
                            {/* linkifyBody is a pure function over the message
                                string — no hook, no window read — so mapping it
                                here does not touch the no-SSR rule this file
                                states above: it is still a plain render of
                                props, the same as {message.body} was. */}
                            {linkifyBody(message.body).map((segment, i) =>
                              segment.kind === "link" ? (
                                <a
                                  key={i}
                                  href={segment.href}
                                  target="_blank"
                                  // noopener: an off-site link opened from a
                                  // chat message must not hand the new tab a
                                  // window.opener it can use to navigate this
                                  // one — the same reverse-tabnabbing reason
                                  // link tiles carry it.
                                  rel="noopener noreferrer"
                                  // currentColor, not a fixed link colour: this
                                  // bubble is white-on-accent when it is the
                                  // reader's own and ink-on-field otherwise, so
                                  // a literal colour would be unreadable on one
                                  // of the two.
                                  className="underline underline-offset-2 break-words"
                                >
                                  {segment.label}
                                </a>
                              ) : (
                                <span key={i}>{segment.value}</span>
                              ),
                            )}
                          </div>
                        )}
                        {onReply && (
                          <button
                            type="button"
                            onClick={() => onReply(message)}
                            aria-label={`${labels.reply}: ${message.body.slice(0, 40)}`}
                            // Same reveal rule as the delete button below:
                            // group-hover + focus-visible, never focus — see
                            // its comment for why.
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] opacity-0 transition-opacity duration-150 hover:bg-[var(--color-field)] group-hover/msg:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
                              accentFocusRing,
                            )}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M9 14 4 9l5-5" />
                              <path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                            </svg>
                          </button>
                        )}
                        {onDeleteMessage && (
                          <button
                            type="button"
                            onClick={() => onDeleteMessage(message.id)}
                            aria-label={`${labels.deleteMessage}: ${message.body.slice(0, 40)}`}
                            // focus-visible, not focus: a mouse click already
                            // reveals it via group-hover, and focus:opacity-100
                            // meant a click that happened to focus the button
                            // first left it stuck visible with no hover — the
                            // same distinction accentFocusRing exists to draw.
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-[var(--color-ink-muted)] opacity-0 transition-opacity duration-150 hover:bg-[var(--color-field)] group-hover/msg:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
                              accentFocusRing,
                            )}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* One timestamp per run, under its last bubble. dateTime
                      carries the instant, so the machine-readable value is
                      unambiguous even though the visible one is local. */}
                  <time
                    dateTime={last.createdAt.toISOString()}
                    className="px-1.5 text-[11px] text-[var(--color-ink-muted)]"
                  >
                    {formatTime(last.createdAt, labels.locale)}
                  </time>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
