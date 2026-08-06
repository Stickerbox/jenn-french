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

export function MessageInput({
  onSend,
  placeholder,
  sendLabel,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
  sendLabel: string;
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
    <form
      onSubmit={submit}
      className="flex items-end gap-3 border-t border-[var(--color-field-border)] p-4"
    >
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
        className="max-h-32 flex-1 resize-none overflow-y-auto rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-3.5 py-2.5 text-base text-[var(--color-ink)] transition-shadow focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35"
      />
      <button
        type="submit"
        disabled={empty || sending}
        aria-label={sendLabel}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
          empty || sending
            ? "bg-[var(--color-field)] text-[var(--color-ink-muted)]"
            : "bg-[var(--color-accent)] text-white hover:opacity-90",
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
  );
}
