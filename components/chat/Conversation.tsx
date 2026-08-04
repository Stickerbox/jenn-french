"use client";

import type { ReactNode } from "react";
import {
  MessageList,
  type MessageListLabels,
} from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import type { ChatMessage } from "@/lib/chat-message";

export type ConversationLabels = MessageListLabels & {
  placeholder: string;
  send: string;
};

// Presentational only — the stream, the send function and the message store all
// live in the FAB above it, so this can mount and unmount with a selection
// without tearing down the connection the unread dots depend on.
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
  // practice whenever `footer` is absent — the two are alternatives.
  onSend?: (body: string) => Promise<void>;
  onDeleteMessage?: (id: string) => void;
  // Replaces the composer. Used for a student who has not signed up yet: the
  // thread stays readable and there is nothing to type into, because there is
  // nobody on the other end to read it.
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          self={self}
          labels={labels}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {footer ??
        (onSend && (
          <MessageInput
            onSend={onSend}
            placeholder={labels.placeholder}
            sendLabel={labels.send}
          />
        ))}
    </>
  );
}
