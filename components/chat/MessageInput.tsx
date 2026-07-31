"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-body";

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
      className="flex items-end gap-2 border-t border-[var(--color-field-border)] p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        maxLength={MAX_MESSAGE_LENGTH}
        className="max-h-32 flex-1 resize-none rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-3 py-2 text-base text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={body.trim() === "" || sending}
        className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {sendLabel}
      </button>
    </form>
  );
}
