"use client";

import { useEffect, useRef } from "react";
import { MessageList, type ChatMessage } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";

export type ChatLabels = {
  title: string;
  empty: string;
  placeholder: string;
  send: string;
  close: string;
  locale: string;
  deleteMessage: string;
};

// Presentational only: the stream, the message list, and the send function all
// live in ChatFab now, so this panel can mount and unmount with `open` without
// tearing down the connection that the unread dot depends on.
export function ChatWindow({
  self,
  labels,
  messages,
  onSend,
  onClose,
  onDeleteMessage,
}: {
  self: "teacher" | "student";
  labels: ChatLabels;
  messages: ChatMessage[];
  onSend: (body: string) => Promise<void>;
  onClose: () => void;
  onDeleteMessage?: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={labels.title}
      tabIndex={-1}
      // Deliberately not aria-modal: the point of a floating panel is that the
      // card stays readable behind it while they type.
      className="fixed bottom-24 right-4 z-50 flex h-[520px] max-h-[70vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] shadow-2xl focus:outline-none"
    >
      <header className="flex items-center justify-between border-b border-[var(--color-field-border)] px-4 py-3">
        <span className="font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
          {labels.title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="text-lg leading-none text-[var(--color-ink-muted)]"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          self={self}
          emptyLabel={labels.empty}
          locale={labels.locale}
          onDeleteMessage={onDeleteMessage}
          deleteLabel={labels.deleteMessage}
        />
      </div>

      <MessageInput
        onSend={onSend}
        placeholder={labels.placeholder}
        sendLabel={labels.send}
      />
    </div>
  );
}
