import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";

// iOS Safari caps a canvas at roughly 16,777,216 pixels and, past it, returns a
// blank image instead of failing — so the export downscales rather than
// silently producing nothing. A little under the real ceiling for headroom.
export const MAX_CANVAS_AREA = 16_000_000;

// The rule between stacked pages, so a reader can see where one ends.
export const PAGE_GAP = 24;

export type ExportLayout = {
  scale: number;
  width: number;
  height: number;
  pageHeight: number;
  gap: number;
};

export function exportLayout(pageCount: number): ExportLayout {
  const pages = Math.max(1, Math.floor(pageCount));
  const naturalHeight = BOARD_HEIGHT * pages + PAGE_GAP * (pages - 1);
  const naturalArea = BOARD_WIDTH * naturalHeight;

  // Never above 1: a two-page board should not be upscaled to fill the budget.
  const scale =
    naturalArea > MAX_CANVAS_AREA
      ? Math.sqrt(MAX_CANVAS_AREA / naturalArea)
      : 1;

  return {
    scale,
    // floor, not round: rounding both of these up puts their product back over
    // MAX_CANVAS_AREA — the exact failure the cap exists to prevent, and one
    // that shows up as a blank JPEG rather than an error.
    width: Math.floor(BOARD_WIDTH * scale),
    height: Math.floor(naturalHeight * scale),
    pageHeight: Math.round(BOARD_HEIGHT * scale),
    gap: Math.round(PAGE_GAP * scale),
  };
}
