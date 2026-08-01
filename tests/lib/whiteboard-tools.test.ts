import { describe, expect, it } from "vitest";
import { pointerDownIntent } from "@/lib/whiteboard-tools";

const base = { hasDraft: false, saving: false };

describe("pointerDownIntent", () => {
  it("opens a text draft without capturing the pointer", () => {
    const intent = pointerDownIntent({ ...base, tool: "text" });
    expect(intent.action).toBe("open-text");
    // The whole bug: capture retargets the compatibility mousedown to the
    // surface, whose default action moves focus off the textarea.
    expect(intent.capturesPointer).toBe(false);
    expect(intent.preventsDefault).toBe(true);
  });

  it("captures the pointer for the drawing tools", () => {
    for (const tool of ["pen", "arrow"] as const) {
      const intent = pointerDownIntent({ ...base, tool });
      expect(intent.action).toBe("start-stroke");
      expect(intent.capturesPointer).toBe(true);
      expect(intent.preventsDefault).toBe(false);
    }
  });

  it("captures the pointer for select, which drags", () => {
    const intent = pointerDownIntent({ ...base, tool: "select" });
    expect(intent.action).toBe("select");
    expect(intent.capturesPointer).toBe(true);
  });

  it("erases", () => {
    const intent = pointerDownIntent({ ...base, tool: "eraser" });
    expect(intent.action).toBe("erase");
    expect(intent.capturesPointer).toBe(true);
  });

  it("ignores everything while saving", () => {
    for (const tool of ["select", "pen", "text", "arrow", "eraser"] as const) {
      expect(pointerDownIntent({ ...base, tool, saving: true }).action).toBe(
        "ignore",
      );
    }
  });

  it("ignores everything while a draft is open", () => {
    for (const tool of ["select", "pen", "text", "arrow", "eraser"] as const) {
      expect(pointerDownIntent({ ...base, tool, hasDraft: true }).action).toBe(
        "ignore",
      );
    }
  });

  it("does not prevent the default while a draft is open", () => {
    // The blur IS the commit. Preventing the default here would stop the click
    // reaching the browser's focus handling, so clicking away from an open text
    // box would never commit it.
    const intent = pointerDownIntent({ ...base, tool: "text", hasDraft: true });
    expect(intent.preventsDefault).toBe(false);
    expect(intent.capturesPointer).toBe(false);
  });
});
