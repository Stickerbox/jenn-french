"use client";

import { useEffect, useRef, useState } from "react";
import { groupByDay } from "@/lib/chat-day";
import { groupIntoRuns } from "@/lib/chat-run";
import { dayHeading } from "@/lib/chat-stamp";
import { formatTime, localDayKey } from "@/lib/chat-time";
import { linkifyBody } from "@/lib/chat-linkify";
import { swipeReply } from "@/lib/swipe-reply";
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
  replyTargetId,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: MessageListLabels;
  onDeleteMessage?: (id: string) => void;
  // Optional for the same reason onDeleteMessage is: a read-only thread (an
  // unclaimed student's footer replaces the composer entirely) has nothing to
  // reply into.
  onReply?: (message: ChatMessage) => void;
  // The message a reply is currently staged against, or null. Passed in rather
  // than held here because the composer owns that state — this only needs to
  // know which bubble to bring into view.
  replyTargetId?: string | null;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  // Where a touch started, and which message it started on. A ref rather than
  // state because nothing renders from it — only the handlers read it, and a
  // setState per touchmove for a value nothing draws would re-render the whole
  // list on every frame of the gesture.
  const swipeStart = useRef<{ id: string; x: number; y: number } | null>(null);
  // Every mounted bubble, by message id, so replyTargetId below can be
  // scrolled to without a query selector over the whole document.
  const messageNodes = useRef(new Map<string, HTMLDivElement>());
  // What IS drawn: one message at a time, so this is a single value rather than
  // a map. Two fingers on two bubbles is not a gesture worth modelling.
  const [swipe, setSwipe] = useState<
    { id: string; offset: number; armed: boolean } | null
  >(null);

  // Jump to the newest whenever one arrives. A chat that opens at the top of a
  // year of history is a chat nobody scrolls.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Bring the quoted message to the bottom of what is still visible.
  //
  // On a phone the keyboard opens at the same moment a reply is staged and
  // takes half the screen with it, so the message being answered is very often
  // behind it — the reader is asked to write about something they can no
  // longer see. `block: "end"` puts it just above the composer, which is
  // exactly where the keyboard's top edge is.
  //
  // Run TWICE, and the second is the one that matters: the keyboard has not
  // opened yet when the reply is staged, so the first scroll aims at a
  // viewport that is about to shrink. visualViewport fires `resize` when it
  // does, and iOS Safari is the browser that shrinks the visual viewport
  // without shrinking the layout one — the same asymmetry ChatPanel already
  // drives its own height from.
  useEffect(() => {
    if (!replyTargetId) return;
    const node = messageNodes.current.get(replyTargetId);
    if (!node) return;

    const bring = () => node.scrollIntoView({ block: "end", behavior: "smooth" });
    bring();

    const viewport = window.visualViewport;
    if (!viewport) return;
    viewport.addEventListener("resize", bring);
    // Unhooked shortly after: this exists for the keyboard opening in
    // response to THIS reply, not for every later resize — an orientation
    // change ten minutes on must not yank the list back to an old quote.
    const stop = window.setTimeout(
      () => viewport.removeEventListener("resize", bring),
      1500,
    );
    return () => {
      window.clearTimeout(stop);
      viewport.removeEventListener("resize", bring);
    };
  }, [replyTargetId]);

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
                        ref={(el) => {
                          // Kept so a staged reply can be scrolled to. A Map
                          // in a ref rather than state: nothing renders from
                          // it, and a setState per mounted bubble would
                          // re-render the list on every message.
                          if (el) messageNodes.current.set(message.id, el);
                          else messageNodes.current.delete(message.id);
                        }}
                        className={cn(
                          "flex flex-col",
                          mine ? "items-end" : "items-start",
                        )}
                      >
                      <div
                        // Unconditional, on the keyed element: the animation
                        // plays once when this node is inserted and does not
                        // replay on a re-render, since the class string never
                        // changes. Only a genuinely new message mounts a new
                        // node.
                        //
                        // `touch-pan-y` is what makes the drag below possible
                        // at all: React attaches touch listeners passively, so
                        // preventDefault() inside onTouchMove does nothing, and
                        // the browser would keep the horizontal gesture for
                        // itself. Declaring that only vertical panning belongs
                        // to the browser hands us the rest — CSS where an event
                        // handler cannot reach.
                        className={cn(
                          "group/msg relative flex items-center gap-1 animate-[bubble-in_180ms_ease-out] motion-reduce:animate-none",
                          mine && "flex-row-reverse",
                          onReply && "touch-pan-y",
                          // No transition WHILE dragging — the row has to sit
                          // under the finger, not chase it. On release the id
                          // clears, this class comes back, and the row eases
                          // home from wherever it was let go.
                          swipe?.id !== message.id &&
                            "transition-transform duration-200 motion-reduce:transition-none",
                        )}
                        style={
                          swipe?.id === message.id
                            ? { transform: `translateX(${swipe.offset}px)` }
                            : undefined
                        }
                        onTouchStart={
                          onReply
                            ? (event) => {
                                const touch = event.touches[0];
                                // Where the finger landed, kept in a ref: it is
                                // read only in these handlers, never during
                                // render, which is what `react-hooks/refs`
                                // forbids.
                                swipeStart.current = {
                                  id: message.id,
                                  x: touch.clientX,
                                  y: touch.clientY,
                                };
                              }
                            : undefined
                        }
                        onTouchMove={
                          onReply
                            ? (event) => {
                                const start = swipeStart.current;
                                if (!start || start.id !== message.id) return;
                                const touch = event.touches[0];
                                const next = swipeReply(
                                  touch.clientX - start.x,
                                  touch.clientY - start.y,
                                );
                                setSwipe(
                                  next ? { id: message.id, ...next } : null,
                                );
                              }
                            : undefined
                        }
                        onTouchEnd={
                          onReply
                            ? () => {
                                // Read before the reset, and the reset happens
                                // either way: a gesture that ended below the
                                // trigger still has to put the row back.
                                const armed =
                                  swipe?.id === message.id && swipe.armed;
                                swipeStart.current = null;
                                setSwipe(null);
                                if (armed) onReply(message);
                              }
                            : undefined
                        }
                      >
                        {/* The target, sitting just off the row's left edge so
                            it is drawn out from under it as the message
                            travels — the row translates and carries this with
                            it. It fills in once the gesture would succeed,
                            because an indicator that appears at the moment of
                            release is one nobody sees. */}
                        {onReply && swipe?.id === message.id && (
                          <span
                            aria-hidden
                            className={cn(
                              "pointer-events-none absolute left-0 top-1/2 flex h-7 w-7 -translate-x-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
                              swipe.armed
                                ? "bg-[var(--color-accent)] text-white"
                                : "bg-[var(--color-field)] text-[var(--color-ink-muted)]",
                            )}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M9 14 4 9l5-5" />
                              <path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                            </svg>
                          </span>
                        )}
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
                            //
                            // Visible below md for the reason the reply button
                            // above states: Jenn reads her inbox on a phone
                            // too, and a control revealed by hover is a control
                            // she does not have there.
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm text-[var(--color-ink-muted)] transition-opacity duration-150 hover:bg-[var(--color-field)] focus-visible:opacity-100 motion-reduce:transition-none md:h-8 md:w-8 md:opacity-0 md:group-hover/msg:opacity-100",
                              accentFocusRing,
                            )}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {onReply && (
                        // THE WORD, not an icon. An arrow beside a bubble said
                        // nothing on its own and was the only label this
                        // control had; the swipe gesture is the fast path and
                        // this is the one that explains itself.
                        //
                        // Under the bubble rather than beside it, so a run of
                        // messages keeps its shape and the text never competes
                        // with the message for width.
                        //
                        // Deliberately short of the 44px hit box this project
                        // asks for, and stated rather than hidden: one under
                        // every bubble at that height would half again the
                        // length of a conversation. On a phone the gesture is
                        // the primary way in — this is the discoverable label
                        // for it, and a documented exception like the tile's
                        // three action icons.
                        <button
                          type="button"
                          onClick={() => onReply(message)}
                          className={cn(
                            "rounded px-1.5 py-1 text-[11px] font-medium text-[var(--color-ink-muted)] transition-colors duration-150 hover:text-[var(--color-accent)] motion-reduce:transition-none",
                            accentFocusRing,
                          )}
                        >
                          {labels.reply}
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
