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
  // Set when re-editing an existing op, so the commit knows to revise rather
  // than to append.
  editing: string | null;
};

export function TextLayer({
  draft,
  box,
  onChange,
  onCommit,
  onCancel,
}: {
  draft: TextDraft;
  // The canvas element's own rect. Positions here are relative to it, so the
  // layer must be inside a `relative` parent that wraps the canvas exactly.
  box: Box;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    // Caret to the end, so re-editing continues rather than overwrites.
    const length = ref.current?.value.length ?? 0;
    ref.current?.setSelectionRange(length, length);
    // Only on mount: refocusing on every keystroke would fight the caret.
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
        // Matches drawOps exactly: the same family, and the same 1.25 line
        // height, or the text shifts the instant it commits.
        fontFamily: 'Georgia, "Times New Roman", serif',
        lineHeight: 1.25,
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
