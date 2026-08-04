import type { ChatMessage } from "@/lib/chat-message";

// StreamProvider holds one flat array covering every conversation the viewer
// may see. For a student that is one conversation and this is a no-op filter;
// for Jenn it is the whole inbox.
//
// The sort is not optional. A conversation's history arrives from a server
// action when she selects it, and can land after a live message from that same
// conversation was already appended. Ordering is (createdAt, id) — the same
// total order lib/messages.ts queries with, so the client and the server never
// disagree about what "the last message" is.
//
// .filter() already returns a fresh array, so sorting it in place cannot reach
// the caller's.
export function messagesFor(
  all: ChatMessage[],
  groupId: string,
): ChatMessage[] {
  return all
    .filter((message) => message.groupId === groupId)
    .sort((a, b) => {
      const difference = a.createdAt.getTime() - b.createdAt.getTime();
      if (difference !== 0) return difference;
      // cuids are not chronological, but they are unique and stable, which is
      // all a tiebreaker has to be.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
