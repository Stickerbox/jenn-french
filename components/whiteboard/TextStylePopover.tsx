"use client";

import type { PointerEvent } from "react";
import { Bold, Italic, Underline, type LucideIcon } from "lucide-react";
import { toOffset, type Box } from "@/lib/whiteboard-geometry";

// Popover size in CSS pixels, not logical units — unlike the draft's x/y this
// never scales with the board, so it stays a fixed constant rather than
// something derived from BOARD_WIDTH.
const POPOVER_WIDTH = 124;
const POPOVER_HEIGHT = 40;
const MARGIN = 8;

// Module-level, like BoardToolbar's IconButton beside it: a component
// declared inside another component's render is recreated every render,
// which react-hooks/static-components flags because it would remount (and
// reset) on every keystroke here.
function StyleButton({
  label,
  active,
  Icon,
  onPointerDown,
}: {
  label: string;
  active: boolean;
  Icon: LucideIcon;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // mousedown/pointerdown, and the toggle happens HERE rather than in a
      // separate onClick. BoardEditor commits the open draft the instant the
      // textarea blurs (see pointerDownIntent's comment in
      // lib/whiteboard-tools.ts) — a button that let the browser run its
      // default pointerdown action would move focus to itself, blur the
      // textarea, and commit (and close) the draft mid-word every time this
      // is pressed. preventDefault() in the handler passed down is what stops
      // the browser from shifting focus at all, so the textarea never loses
      // its caret or selection and the draft stays open. This is the one
      // thing in this popover a later edit is most likely to get wrong by
      // "simplifying" it onto onClick.
      onPointerDown={onPointerDown}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-[var(--card-line)] transition-colors ${
        active
          ? "bg-[var(--card-bleu)] text-white"
          : "bg-[var(--card-paper)] text-[var(--card-moss)]"
      }`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

// One control applying to the WHOLE element, not a character range. A
// per-character rich-text model — spans, a selection-aware toolbar deciding
// "is the current selection bold" — is a different, much bigger feature this
// codebase's flat op shape (TextOp is one string, one colour, one size) has no
// room for. Retyping with the wrong stretch bold is the same fix as retyping
// with a typo: reopen the element and change it.
export function TextStylePopover({
  draft,
  box,
  onToggle,
}: {
  draft: { x: number; y: number; bold: boolean; italic: boolean; underline: boolean };
  // The same box TextLayer positions itself against, so the two agree about
  // where "near the draft" is.
  box: Box;
  onToggle: (style: "bold" | "italic" | "underline") => void;
}) {
  const [left, top] = toOffset(box, draft.x, draft.y);

  // Above the anchor by default, so the popover never sits over the text
  // being typed directly below it — clamped to the surface's own edges rather
  // than allowed to run past them, since a draft can open anywhere on the
  // board including its top and right edges.
  const clampedTop = Math.min(
    Math.max(MARGIN, top - POPOVER_HEIGHT - MARGIN),
    Math.max(MARGIN, box.height - POPOVER_HEIGHT - MARGIN),
  );
  const clampedLeft = Math.min(
    Math.max(MARGIN, left),
    Math.max(MARGIN, box.width - POPOVER_WIDTH - MARGIN),
  );

  function toggle(style: "bold" | "italic" | "underline") {
    return (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onToggle(style);
    };
  }

  return (
    <div
      // Not part of the click-to-commit surface: a click that lands here
      // must toggle a style, never fall through to the canvas underneath and
      // start a stroke or move the caret.
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: clampedLeft,
        top: clampedTop,
        width: POPOVER_WIDTH,
        height: POPOVER_HEIGHT,
      }}
      className="flex items-center justify-center gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-1 shadow-md"
    >
      <StyleButton label="Gras" active={draft.bold} Icon={Bold} onPointerDown={toggle("bold")} />
      <StyleButton
        label="Italique"
        active={draft.italic}
        Icon={Italic}
        onPointerDown={toggle("italic")}
      />
      <StyleButton
        label="Souligné"
        active={draft.underline}
        Icon={Underline}
        onPointerDown={toggle("underline")}
      />
    </div>
  );
}
