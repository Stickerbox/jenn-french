import { describe, expect, it } from "vitest";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { MAX_CANVAS_AREA, PAGE_GAP, exportLayout } from "@/lib/whiteboard-export";

describe("exportLayout", () => {
  it("renders a single page at full size", () => {
    const layout = exportLayout(1);
    expect(layout.scale).toBe(1);
    expect(layout.width).toBe(BOARD_WIDTH);
    expect(layout.height).toBe(BOARD_HEIGHT);
  });

  it("stacks pages with a gap between them", () => {
    const layout = exportLayout(3);
    expect(layout.scale).toBe(1);
    expect(layout.height).toBe(BOARD_HEIGHT * 3 + PAGE_GAP * 2);
  });

  it("treats a zero or negative page count as one page", () => {
    expect(exportLayout(0)).toEqual(exportLayout(1));
    expect(exportLayout(-4)).toEqual(exportLayout(1));
  });

  // iOS Safari will not allocate a canvas past roughly 16.7M pixels and hands
  // back a BLANK image rather than an error, so this cap prevents a silent
  // failure rather than a loud one.
  it("scales down once the canvas would exceed the area ceiling", () => {
    const layout = exportLayout(12);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.width * layout.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });

  it("never scales up", () => {
    expect(exportLayout(2).scale).toBe(1);
  });

  it("keeps the scaled canvas proportional to the unscaled one", () => {
    const layout = exportLayout(40);
    const unscaled = BOARD_HEIGHT * 40 + PAGE_GAP * 39;
    expect(layout.width / layout.height).toBeCloseTo(BOARD_WIDTH / unscaled, 2);
  });

  it("reports the scaled page height and gap so the caller draws consistently", () => {
    const layout = exportLayout(12);
    expect(layout.pageHeight).toBe(Math.round(BOARD_HEIGHT * layout.scale));
    expect(layout.gap).toBe(Math.round(PAGE_GAP * layout.scale));
  });
});
