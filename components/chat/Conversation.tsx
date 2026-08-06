"use client";

import { useState, type ReactNode } from "react";
import {
  MessageList,
  type MessageListLabels,
} from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import type { ChatMessage } from "@/lib/chat-message";

export type ConversationLabels = MessageListLabels & {
  placeholder: string;
  send: string;
  cancelReply: string;
};

// Presentational only — the stream, the send function and the message store all
// live in the FAB above it, so this can mount and unmount with a selection
// without tearing down the connection the unread dots depend on.
//
// The one exception is which message is being replied to: that is a fact
// about what is currently staged in THIS composer, not about the stream, so
// it lives here as local state rather than being threaded up. A caller that
// wants it cleared on a fresh conversation (InboxFab, switching students) keys
// this component by groupId, the same trick UnclaimedNotice already uses one
// level up.
export function Conversation({
  messages,
  self,
  labels,
  onSend,
  onDeleteMessage,
  footer,
}: {
  messages: ChatMessage[];
  self: "teacher" | "student";
  labels: ConversationLabels;
  // Optional because a read-only thread has nothing to send. Required in
  // practice whenever `footer` is absent — the two are alternatives. Takes the
  // id of the message being replied to, or null for a plain send.
  onSend?: (body: string, replyToId: string | null) => Promise<void>;
  onDeleteMessage?: (id: string) => void;
  // Replaces the composer. Used for a student who has not signed up yet: the
  // thread stays readable and there is nothing to type into, because there is
  // nobody on the other end to read it.
  footer?: ReactNode;
}) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  async function handleSend(body: string) {
    if (!onSend) return;
    await onSend(body, replyTo?.id ?? null);
    // Cleared only after the round trip succeeds — a failed send leaves the
    // quote staged so retrying still answers the right message, the same
    // restore-on-failure MessageInput already does for the body text.
    setReplyTo(null);
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          self={self}
          labels={labels}
          onDeleteMessage={onDeleteMessage}
          onReply={onSend ? setReplyTo : undefined}
        />
      </div>

      {footer ??
        (onSend && (
          <MessageInput
            onSend={handleSend}
            placeholder={labels.placeholder}
            sendLabel={labels.send}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            cancelReplyLabel={labels.cancelReply}
          />
        ))}
    </>
  );
}
