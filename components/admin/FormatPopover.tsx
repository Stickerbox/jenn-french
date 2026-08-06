"use client";

import { Bold, Code, Italic } from "lucide-react";
import { CARD_COLORS, type CardColor } from "@/lib/inline-markup";
import type { Emphasis, RangeMarks } from "@/lib/rich-text";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { CARD_COLOR_VAR } from "@/components/card-styles";
import { cn } from "@/lib/utils";

export type PopoverAnchor = {
  left: number;
  top: number;
  // Above the selection normally; below it when the selection sits too close
  // to the top of the viewport for the panel to fit.
  below: boolean;
};

const buttonClass =
  "flex h-9 w-9 items-center justify-center rounded-md text-[15px] " +
  "text-[var(--card-ink)] transition-colors hover:bg-[var(--card-line)]/40";

const activeClass = "bg-[var(--card-line)]/60";

export function FormatPopover({
  marks,
  anchor,
  onEmphasis,
  onColor,
  locale,
}: {
  marks: RangeMarks;
  anchor: PopoverAnchor;
  onEmphasis: (mark: Emphasis) => void;
  onColor: (color: CardColor) => void;
  // `colorLabel` below is a function, so this takes `locale` rather than a
  // resolved (or sliced) `Strings` object — see lib/strings.ts on why that
  // value cannot cross a server/client boundary. RichText, its only caller,
  // already has `locale` in scope.
  locale: Locale;
}) {
  const labels = getStrings(locale).admin.formatPopover;
  return (
    <div
      role="toolbar"
      aria-label={labels.textFormatting}
      // The selection is lost the moment the field blurs, and mousedown is
      // what blurs it — so the press never reaches the browser's default at
      // all. click still fires, and by then the selection is still intact.
      onMouseDown={(event) => event.preventDefault()}
      style={{ left: anchor.left, top: anchor.top }}
      className={cn(
        "fixed z-50 -translate-x-1/2 rounded-xl border border-[var(--card-line)]",
        "bg-[var(--card-paper)] p-1.5 shadow-[0_10px_30px_-10px_rgb(31_42_46/0.35)]",
        anchor.below ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="flex justify-center gap-1">
        <button
          type="button"
          aria-label={labels.bold}
          aria-pressed={marks.bold}
          onClick={() => onEmphasis("bold")}
          className={cn(buttonClass, marks.bold && activeClass)}
        >
          <Bold size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={labels.italic}
          aria-pressed={marks.italic}
          onClick={() => onEmphasis("italic")}
          className={cn(buttonClass, marks.italic && activeClass)}
        >
          <Italic size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
        {/* The phonetic chip — `freht`, `bin` — which she writes on nearly
            every pronunciation section and had been typing backticks for. */}
        <button
          type="button"
          aria-label={labels.phonetic}
          aria-pressed={marks.code}
          onClick={() => onEmphasis("code")}
          className={cn(buttonClass, marks.code && activeClass)}
        >
          <Code size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1.5 flex justify-center gap-1.5 border-t border-[var(--card-line)]/60 pt-1.5">
        {CARD_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={labels.colorLabel(color)}
            aria-pressed={marks.color === color}
            onClick={() => onColor(color)}
            // The ring rather than a border, so the swatch itself is the same
            // size whether or not it is the current colour.
            className={cn(
              "h-6 w-6 rounded-full transition-shadow",
              marks.color === color
                ? "ring-2 ring-[var(--card-ink)] ring-offset-2 ring-offset-[var(--card-paper)]"
                : "ring-1 ring-black/15",
            )}
            style={{ backgroundColor: `var(${CARD_COLOR_VAR[color]})` }}
          />
        ))}
      </div>
    </div>
  );
}
