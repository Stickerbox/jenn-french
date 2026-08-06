"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-body";
import { cn } from "@/lib/utils";
import { accentFocusRing } from "@/components/ui/field";
import type { ChatMessage } from "@/lib/chat-message";

export function MessageInput({
  onSend,
  placeholder,
  sendLabel,
  replyTo,
  onCancelReply,
  cancelReplyLabel,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
  sendLabel: string;
  // The message being quoted, or none. Both undefined and null mean "not
  // replying" — undefined is what a caller with no reply feature at all
  // passes, null is Conversation's own "cleared" state — so the preview below
  // treats them the same rather than distinguishing a case nothing needs.
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  cancelReplyLabel?: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Re-measured on every change rather than only on input: this also fires
  // when `body` is cleared programmatically (optimistic send, restore-on-
  // failure), which is what lets the box shrink back down instead of staying
  // stretched to its last height. Resetting to "auto" first is what allows the
  // shrink at all — a height carried over from before would only ever grow.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const empty = body.trim() === "";

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = body.trim();
    if (trimmed === "" || sending) return;

    setSending(true);
    // Cleared optimistically: the field emptying is the acknowledgement, and
    // waiting for the round trip makes fast typing feel broken.
    setBody("");
    try {
      await onSend(trimmed);
    } catch {
      // Put it back rather than losing what they wrote.
      setBody(trimmed);
    } finally {
      setSending(false);
    }
  }

  // Enter sends, Shift+Enter makes a new line — the convention of every chat
  // this teacher and her students already use.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="border-t border-[var(--color-field-border)]">
      {replyTo && (
        // What is being replied to, with a way to back out of it. Truncated
        // rather than wrapped in full: this is a reminder of which message the
        // send is about to answer, not a second reading of it.
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1 border-l-2 border-[var(--color-accent)] py-0.5 pl-2 text-xs text-[var(--color-ink-muted)]">
            <p className="line-clamp-2 break-words">{replyTo.body}</p>
          </div>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              aria-label={cancelReplyLabel}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-field)] motion-reduce:transition-none",
                accentFocusRing,
              )}
            >
              ×
            </button>
          )}
        </div>
      )}
      <form onSubmit={submit} className="flex items-end gap-3 p-4">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          // text-base, not smaller: iOS Safari zooms the whole page in on focus
          // of any field under 16px.
          className="max-h-32 flex-1 resize-none overflow-y-auto rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-3.5 py-2.5 text-base text-[var(--color-ink)] transition-shadow duration-150 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35 motion-reduce:transition-none"
        />
        <button
          type="submit"
          disabled={empty || sending}
          aria-label={sendLabel}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95 motion-reduce:transition-none",
            empty || sending
              ? "bg-[var(--color-field)] text-[var(--color-ink-muted)]"
              : "bg-[var(--color-accent)] text-white hover:opacity-90",
            accentFocusRing,
          )}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>
    </div>
  );
}
