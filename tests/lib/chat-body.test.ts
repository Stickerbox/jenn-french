import { describe, it, expect } from "vitest";
import { parseMessageBody, MAX_MESSAGE_LENGTH } from "@/lib/chat-body";

describe("parseMessageBody", () => {
  it("accepts an ordinary message", () => {
    expect(parseMessageBody("Bonjour !")).toBe("Bonjour !");
  });

  it("trims surrounding whitespace", () => {
    expect(parseMessageBody("  salut  ")).toBe("salut");
  });

  it("rejects an empty message", () => {
    expect(parseMessageBody("")).toBeNull();
  });

  it("rejects whitespace only", () => {
    expect(parseMessageBody("   \n  ")).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(parseMessageBody(42)).toBeNull();
    expect(parseMessageBody(null)).toBeNull();
    expect(parseMessageBody(undefined)).toBeNull();
    expect(parseMessageBody({ body: "salut" })).toBeNull();
  });

  it("accepts a message exactly at the limit", () => {
    expect(parseMessageBody("a".repeat(MAX_MESSAGE_LENGTH))).toHaveLength(
      MAX_MESSAGE_LENGTH,
    );
  });

  it("rejects a message past the limit", () => {
    expect(parseMessageBody("a".repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
  });

  it("measures the limit after trimming", () => {
    const padded = `  ${"a".repeat(MAX_MESSAGE_LENGTH)}  `;
    expect(parseMessageBody(padded)).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});
