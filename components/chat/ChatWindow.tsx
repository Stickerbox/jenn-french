"use client";

import { useEffect, useRef, useState } from "react";
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

export function ChatWindow({
  slug,
  token,
  self,
  labels,
  onClose,
  onMessages,
  onDeleteMessage,
}: {
  slug: string;
  token: string | null;
  self: "teacher" | "student";
  labels: ChatLabels;
  onClose: () => void;
  onMessages: (messages: ChatMessage[]) => void;
  onDeleteMessage?: (id: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const panel = useRef<HTMLDivElement>(null);

  const query = token ? `?k=${encodeURIComponent(token)}` : "";

  useEffect(() => {
    const source = new EventSource(`/api/chat/${slug}/stream${query}`);

    source.onmessage = (event) => {
      const raw = JSON.parse(event.data) as ChatMessage & { createdAt: string };
      const message = { ...raw, createdAt: new Date(raw.createdAt) };
      setMessages((current) =>
        // De-duplicated by id because a reconnect replays, and because the
        // sender receives its own message back through the stream.
        current.some((m) => m.id === message.id)
          ? current
          : [...current, message],
      );
    };

    return () => source.close();
  }, [slug, query]);

  useEffect(() => {
    onMessages(messages);
  }, [messages, onMessages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(body: string) {
    const response = await fetch(`/api/chat/${slug}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) throw new Error("send failed");
    // Nothing is appended here — the message arrives back through the stream,
    // which is also what gives it its real id and timestamp.
  }

  // The SSE stream only ever carries insertions, so a delete has to be
  // reflected locally by hand — nothing else will tell this client the
  // message is gone.
  async function handleDeleteMessage(id: string) {
    if (!onDeleteMessage) return;
    await onDeleteMessage(id);
    setMessages((current) => current.filter((m) => m.id !== id));
  }

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
          onDeleteMessage={onDeleteMessage ? handleDeleteMessage : undefined}
          deleteLabel={labels.deleteMessage}
        />
      </div>

      <MessageInput
        onSend={send}
        placeholder={labels.placeholder}
        sendLabel={labels.send}
      />
    </div>
  );
}
