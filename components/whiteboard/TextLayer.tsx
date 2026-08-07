"use client";

import { useEffect, useRef } from "react";
import { logicalToPx, toOffset, type Box } from "@/lib/whiteboard-geometry";
import type { Colour } from "@/lib/whiteboard-ops";

export type TextDraft = {
  x: number;
  y: number;
  value: string;
  colour: Colour;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  // Set when re-editing an existing op, so the commit knows to revise rather
  // than to append.
  editing: string | null;
  // Where to place the caret on mount, in characters into `value`. Null for a
  // freshly-opened empty box, where there is nothing to be "near" and the
  // start is the only sensible place. For a reopened element it is computed
  // from where the double-click landed (BoardEditor.handleDoubleClick, via
  // lib/whiteboard-hit's caretIndexInText) — without it every retype put the
  // caret at the very end, which turned "fix the middle word" into "delete
  // everything after it and retype".
  caret: number | null;
};

export function TextLayer({
  draft,
  box,
  onChange,
  onCommit,
  onCancel,
  onToggleStyle,
}: {
  draft: TextDraft;
  // The canvas element's own rect. Positions here are relative to it, so the
  // layer must be inside a `relative` parent that wraps the canvas exactly.
  box: Box;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onToggleStyle: (style: "bold" | "italic" | "underline") => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    // draft.caret if the popover/double-click computed one, otherwise the end
    // — the original behaviour, and still correct for a brand-new empty box.
    const length = ref.current?.value.length ?? 0;
    const pos = draft.caret ?? length;
    ref.current?.setSelectionRange(pos, pos);
    // Only on mount: refocusing on every keystroke would fight the caret, and
    // re-running this for a style toggle would blow away a selection she just
    // made to retype one word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fontSize = logicalToPx(draft.size, box.width);
  const [left, top] = toOffset(box, draft.x, draft.y);

  return (
    <textarea
      ref={ref}
      value={draft.value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        // Enter is a newline — drawOps already splits a text op on \n. So the
        // deliberate commit is the modifier chord, and blur covers the rest.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit();
          return;
        }
        // Cmd/Ctrl+B/I/U toggle THIS element's style, the same one thing the
        // popover's buttons do. preventDefault is required — without it
        // Chrome still tries (and fails, silently, since this is a plain
        // textarea with no execCommand target) to run its own bold command,
        // and Firefox's would visibly do nothing either way, which reads as a
        // broken shortcut rather than a missing one.
        if ((event.metaKey || event.ctrlKey) && !event.altKey) {
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i" || key === "u") {
            event.preventDefault();
            onToggleStyle(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
          }
        }
      }}
      // Stops a click inside the textarea reaching the canvas underneath and
      // starting a stroke or moving the caret somewhere else.
      onPointerDown={(event) => event.stopPropagation()}
      spellCheck={false}
      rows={1}
      style={{
        position: "absolute",
        left,
        top,
        color: draft.colour,
        fontSize,
        // Matches drawOps/textFont exactly: the same family, the same 1.25
        // line height, and now the same weight, style and underline — or the
        // text visibly reflows or restyles itself the instant it commits, the
        // same jump CLAUDE.md already calls out for family/size/line-height.
        fontFamily: 'Georgia, "Times New Roman", serif',
        lineHeight: 1.25,
        fontWeight: draft.bold ? "bold" : "normal",
        fontStyle: draft.italic ? "italic" : "normal",
        textDecorationLine: draft.underline ? "underline" : "none",
        background: "transparent",
        border: "none",
        outline: "none",
        padding: 0,
        margin: 0,
        resize: "none",
        overflow: "hidden",
        // Grows with the content instead of scrolling inside a fixed box.
        width: `${Math.max(6, draft.value.split("\n").reduce((longest, line) => Math.max(longest, line.length), 0) + 1)}ch`,
        height: `${(draft.value.split("\n").length || 1) * fontSize * 1.25}px`,
        caretColor: draft.colour,
      }}
    />
  );
}
