"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage } from "@/components/chat/MessageList";
import { readOps, type DrawOp, type Op } from "@/lib/whiteboard-ops";

export type LiveBoardState = {
  ops: Op[];
  // The stroke under her cursor. Replaced wholesale on every frame, never
  // appended — that is what makes a growing line grow instead of duplicating.
  pending: DrawOp | null;
  currentPage: number;
} | null;

type StreamValue = {
  messages: ChatMessage[];
  removeMessage: (id: string) => void;
  board: LiveBoardState;
};

const StreamContext = createContext<StreamValue | null>(null);

export function useStream(): StreamValue {
  const value = useContext(StreamContext);
  if (!value) throw new Error("useStream used outside StreamProvider");
  return value;
}

export function StreamProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [board, setBoard] = useState<LiveBoardState>(null);

  // Opened on mount and held for as long as this component is mounted — not
  // just while a panel is open. That was already true of the EventSource this
  // replaces, deliberately: an unread dot can only reflect messages the client
  // actually observed, and a live board must reach a student sitting on the
  // Card tab.
  useEffect(() => {
    const source = new EventSource(`/api/chat/${slug}/stream`);

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

    source.addEventListener("board", (event) => {
      const frame = JSON.parse((event as MessageEvent).data) as {
        kind: "open" | "ops" | "saved" | "closed";
        ops?: unknown;
        pending?: unknown;
        currentPage?: number;
      };

      if (frame.kind === "saved" || frame.kind === "closed") {
        setBoard(null);
        return;
      }

      if (frame.kind === "open") {
        setBoard({ ops: [], pending: null, currentPage: 0 });
        return;
      }

      // readOps on the way in as well as on the way out: this arrived over a
      // network as JSON, and nothing between here and there has checked it.
      const ops = readOps(frame.ops);
      const candidate = readOps([frame.pending])[0] ?? null;
      const pending =
        candidate && candidate.kind !== "remove" ? candidate : null;

      setBoard((current) => {
        const page = frame.currentPage ?? current?.currentPage ?? 0;
        // ops APPEND — a snapshot arrives as one frame holding the whole log,
        // and an incremental flush as a few ops, and appending handles both
        // because a snapshot only ever reaches a client whose board is empty.
        // pending REPLACES, because it is one stroke being redrawn.
        if (!current) return { ops, pending, currentPage: page };
        return { ops: [...current.ops, ...ops], pending, currentPage: page };
      });
    });

    return () => source.close();
  }, [slug]);

  const value = useMemo<StreamValue>(
    () => ({
      messages,
      removeMessage: (id: string) =>
        setMessages((current) => current.filter((m) => m.id !== id)),
      board,
    }),
    [messages, board],
  );

  return (
    <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
  );
}
