import { describe, it, expect } from "vitest";
import { messagesFor } from "@/lib/chat-select";
import type { ChatMessage } from "@/lib/chat-message";

const msg = (id: string, groupId: string, iso: string): ChatMessage => ({
  id,
  groupId,
  fromTeacher: false,
  body: id,
  automated: false,
  href: null,
  replyToId: null,
  replyTo: null,
  createdAt: new Date(iso),
});

describe("messagesFor", () => {
  it("returns nothing when the group has no messages", () => {
    expect(messagesFor([msg("a", "g1", "2026-08-04T10:00:00Z")], "g2")).toEqual(
      [],
    );
  });

  it("keeps only the group asked for", () => {
    const all = [
      msg("a", "g1", "2026-08-04T10:00:00Z"),
      msg("b", "g2", "2026-08-04T10:01:00Z"),
      msg("c", "g1", "2026-08-04T10:02:00Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["a", "c"]);
  });

  // The case the sort exists for: history fetched on select lands after a live
  // message that arrived before she opened the conversation.
  it("sorts out-of-order arrivals by time", () => {
    const all = [
      msg("live", "g1", "2026-08-04T12:00:00Z"),
      msg("old", "g1", "2026-08-04T09:00:00Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["old", "live"]);
  });

  // The same total order the server queries use, (createdAt, id). Without the
  // tiebreak, two messages sharing a millisecond swap places between renders.
  it("breaks a same-millisecond tie on the id", () => {
    const all = [
      msg("b", "g1", "2026-08-04T10:00:00.000Z"),
      msg("a", "g1", "2026-08-04T10:00:00.000Z"),
    ];
    expect(messagesFor(all, "g1").map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const all = [
      msg("live", "g1", "2026-08-04T12:00:00Z"),
      msg("old", "g1", "2026-08-04T09:00:00Z"),
    ];
    messagesFor(all, "g1");
    expect(all.map((m) => m.id)).toEqual(["live", "old"]);
  });

  it("returns the messages themselves, not copies", () => {
    const one = msg("a", "g1", "2026-08-04T10:00:00Z");
    expect(messagesFor([one], "g1")[0]).toBe(one);
  });
});
