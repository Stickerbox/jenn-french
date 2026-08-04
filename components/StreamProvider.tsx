"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage } from "@/lib/chat-message";
import { readOps, type DrawOp, type Op } from "@/lib/whiteboard-ops";

export type LiveBoardState = {
  ops: Op[];
  // The stroke under her cursor. Replaced wholesale on every frame, never
  // appended — that is what makes a growing line grow instead of duplicating.
  pending: DrawOp | null;
  currentPage: number;
} | null;

type StreamValue = {
  // Flat and multi-conversation. For a student every entry shares one groupId
  // and this behaves exactly as the single-conversation array it replaces; for
  // Jenn it is the whole inbox. lib/chat-select.ts picks one out.
  messages: ChatMessage[];
  // History fetched by loadConversation lands here, in the same store as live
  // messages, so a conversation has one source of truth rather than two that
  // have to be merged at every read.
  ingest: (messages: ChatMessage[]) => void;
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
  url,
  children,
}: {
  // A URL rather than a slug, because there are two endpoints now — see
  // lib/stream-url.ts, which is the only thing that should build one.
  url: string;
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
    const source = new EventSource(url);

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
  }, [url]);

  const value = useMemo<StreamValue>(
    () => ({
      messages,
      ingest: (incoming: ChatMessage[]) =>
        setMessages((current) => {
          const known = new Set(current.map((m) => m.id));
          const fresh = incoming.filter((m) => !known.has(m.id));
          // Returning the SAME array when nothing is new matters: re-selecting
          // an already-loaded conversation would otherwise replace the array
          // identity and re-render every message in it.
          return fresh.length === 0 ? current : [...current, ...fresh];
        }),
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
