export type OrderableConversation = {
  name: string;
  lastMessage: { createdAt: Date } | null;
};

// Inbox order: whoever wrote last is on top. Only tolerable because the list
// has a search field beside it — recency alone means a specific student is
// somewhere different every time she looks.
//
// Copied before sorting: Array.prototype.sort mutates, and this is handed a
// prop that React may be holding on to.
export function orderConversations<T extends OrderableConversation>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.lastMessage && b.lastMessage) {
      const difference =
        b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime();
      // Two messages in the same millisecond would otherwise order by whatever
      // the sort happened to do, and the list would reshuffle on refresh.
      return difference !== 0 ? difference : byName(a, b);
    }
    // A student with no messages is not "infinitely old" — they are a separate
    // group that sits below every conversation, however stale.
    if (a.lastMessage) return -1;
    if (b.lastMessage) return 1;
    return byName(a, b);
  });
}

// fr-CA so "Émile" files under E rather than after Z, which is where a plain
// code-point compare would put it.
function byName(a: OrderableConversation, b: OrderableConversation): number {
  return a.name.localeCompare(b.name, "fr-CA");
}
