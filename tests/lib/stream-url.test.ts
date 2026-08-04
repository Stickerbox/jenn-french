import { describe, it, expect } from "vitest";
import { streamUrl } from "@/lib/stream-url";

describe("streamUrl", () => {
  it("sends a student to their own conversation's stream", () => {
    expect(streamUrl({ isTeacher: false, slug: "marie" })).toBe(
      "/api/chat/marie/stream",
    );
  });

  it("sends the teacher to the inbox stream", () => {
    expect(streamUrl({ isTeacher: true, slug: null })).toBe("/api/inbox/stream");
  });

  // One connection, not two: on a student's page she needs the inbox AND that
  // board, and a second EventSource would replay a backlog twice — the bug
  // StreamProvider was created to fix.
  it("folds the board channel into the teacher's stream on a student page", () => {
    expect(streamUrl({ isTeacher: true, slug: "marie" })).toBe(
      "/api/inbox/stream?board=marie",
    );
  });

  it("encodes a slug so an odd one cannot break the URL", () => {
    expect(streamUrl({ isTeacher: true, slug: "a b" })).toBe(
      "/api/inbox/stream?board=a%20b",
    );
    expect(streamUrl({ isTeacher: false, slug: "a b" })).toBe(
      "/api/chat/a%20b/stream",
    );
  });

  // A student with no slug is not a state any page can reach — it would mean a
  // chat with nobody. Throwing says so, rather than opening a 404 stream that
  // retries forever.
  it("throws for a student with no slug", () => {
    expect(() => streamUrl({ isTeacher: false, slug: null })).toThrow();
  });
});
