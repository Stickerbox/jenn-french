import { describe, it, expect } from "vitest";
import { orderConversations } from "@/lib/inbox-order";

const conv = (name: string, iso: string | null) => ({
  name,
  lastMessage: iso ? { createdAt: new Date(iso) } : null,
});

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe("orderConversations", () => {
  it("returns nothing for an empty list", () => {
    expect(orderConversations([])).toEqual([]);
  });

  it("puts the most recent conversation first", () => {
    const result = orderConversations([
      conv("Luc", "2026-08-01T10:00:00Z"),
      conv("Marie", "2026-08-04T10:00:00Z"),
      conv("Sophie", "2026-07-28T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Marie", "Luc", "Sophie"]);
  });

  it("puts students who have never written at the bottom", () => {
    const result = orderConversations([
      conv("Antoine", null),
      conv("Marie", "2026-08-04T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Marie", "Antoine"]);
  });

  it("orders the never-written alphabetically among themselves", () => {
    const result = orderConversations([
      conv("Zoé", null),
      conv("Antoine", null),
      conv("Marie", null),
    ]);
    expect(names(result)).toEqual(["Antoine", "Marie", "Zoé"]);
  });

  // Two messages landing in the same millisecond would otherwise order by
  // whatever the sort happened to do, and the list would reshuffle on refresh.
  it("breaks a tie on the name", () => {
    const result = orderConversations([
      conv("Zoé", "2026-08-04T10:00:00Z"),
      conv("Antoine", "2026-08-04T10:00:00Z"),
    ]);
    expect(names(result)).toEqual(["Antoine", "Zoé"]);
  });

  it("sorts accented names the way a French reader expects", () => {
    const result = orderConversations([
      conv("Émile", null),
      conv("Eva", null),
      conv("Fabien", null),
    ]);
    expect(names(result)).toEqual(["Émile", "Eva", "Fabien"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [
      conv("Luc", "2026-08-01T10:00:00Z"),
      conv("Marie", "2026-08-04T10:00:00Z"),
    ];
    orderConversations(input);
    expect(names(input)).toEqual(["Luc", "Marie"]);
  });

  it("keeps the caller's own fields", () => {
    const result = orderConversations([
      { ...conv("Marie", "2026-08-04T10:00:00Z"), unread: 3 },
    ]);
    expect(result[0].unread).toBe(3);
  });
});
