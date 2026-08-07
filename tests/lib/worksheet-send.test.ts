import { describe, expect, it } from "vitest";
import { sendState } from "@/lib/worksheet-send";

describe("sendState", () => {
  it("has nothing to send before anything is saved", () => {
    expect(sendState({ hasOwnVersion: false, sent: false, dirty: false })).toBe(
      "empty",
    );
  });

  it("is ready once saved work has never been announced", () => {
    expect(sendState({ hasOwnVersion: true, sent: false, dirty: false })).toBe(
      "ready",
    );
  });

  it("is spent once announced, until something changes", () => {
    expect(sendState({ hasOwnVersion: true, sent: true, dirty: false })).toBe(
      "sent",
    );
  });

  it("comes back to ready on the next keystroke", () => {
    // The save that follows a keystroke sets sentAt back to null, so this is
    // what the button looks like in the ten seconds before that write lands.
    expect(sendState({ hasOwnVersion: true, sent: true, dirty: true })).toBe(
      "ready",
    );
  });

  it("is ready on unsaved typing that has no row behind it yet", () => {
    // The very first ten seconds of the very first visit. Pressing Send here
    // must work: the button flushes the pending write, THEN announces it.
    expect(sendState({ hasOwnVersion: false, sent: false, dirty: true })).toBe(
      "ready",
    );
  });
});
