"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  parseInlineMarkup,
  serialiseRuns,
  type CardColor,
  type MarkupRun,
} from "@/lib/inline-markup";
import {
  marksInRange,
  replaceRange,
  setColor,
  toggleEmphasis,
} from "@/lib/rich-text";
import { applyFieldStyle, type FieldStyle } from "@/lib/field-styles";
import { CARD_COLOR_VAR } from "@/components/card-styles";
import {
  FormatPopover,
  type PopoverAnchor,
} from "@/components/admin/FormatPopover";
import { cn } from "@/lib/utils";

// The markers are never rendered, so this cannot be a textarea: the field is a
// contenteditable showing the formatted text, and the markup string is the
// state behind it. Everything that decides *what* the markup becomes lives in
// lib/rich-text.ts as a pure function of (markup, selection); this file only
// bridges that to the DOM.

type Offsets = { start: number; end: number };

type Marks = Omit<MarkupRun, "text">;

const NO_MARKS: Marks = {
  bold: false,
  italic: false,
  code: false,
  color: null,
};

const baseClass =
  "w-full whitespace-pre-wrap break-words rounded-sm border-0 bg-transparent p-0 outline-none transition-colors " +
  "hover:bg-[var(--card-line)]/25 " +
  "focus:border-b focus:border-dashed focus:border-[var(--card-line)]";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline styles rather than Tailwind classes: this HTML is built as a string
// at runtime, and Tailwind only emits classes it can find in the source.
function runsToHtml(runs: MarkupRun[]): string {
  return runs
    .filter((run) => run.text !== "")
    .map((run) => {
      const data = [
        run.bold ? ' data-b="1"' : "",
        run.italic ? ' data-i="1"' : "",
        run.code ? ' data-k="1"' : "",
        run.color ? ` data-c="${run.color}"` : "",
      ].join("");
      const css = [
        run.bold ? "font-weight:600" : "",
        run.italic ? "font-style:italic" : "",
        // Mirrors cardCodeChip, so a phonetic looks in the editor like it will
        // on the card — including taking the chip's own moss over the run's
        // colour. Kept as literal CSS rather than the class, since this HTML is
        // built at runtime and Tailwind cannot see it.
        run.code
          ? "font-family:var(--card-font-mono);font-size:13px;background:#eef3ee;border-radius:4px;padding:2px 6px"
          : "",
        run.code
          ? "color:var(--card-moss)"
          : run.color
            ? `color:var(${CARD_COLOR_VAR[run.color]})`
            : "",
      ]
        .filter(Boolean)
        .join(";");
      return `<span${data} style="${css}">${escapeHtml(run.text)}</span>`;
    })
    .join("");
}

// The marks are read back off the data attributes rather than the computed
// style, so a colour the browser inherited from a parent is never mistaken for
// one the teacher chose.
function domToRuns(root: HTMLElement): MarkupRun[] {
  const runs: MarkupRun[] = [];

  function walk(node: Node, marks: Marks) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      if (text !== "") runs.push({ ...marks, text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;

    // A newline is a "\n" character here, because the field is pre-wrap. A
    // <br> only appears when a browser parks one at the end of an empty line,
    // and that one is padding rather than content.
    if (el.tagName === "BR") {
      if (el !== root.lastChild) runs.push({ ...marks, text: "\n" });
      return;
    }

    // Defensive: Enter and the emphasis shortcuts are intercepted, so neither
    // block wrappers nor <b>/<i> should ever get in. If one does, it is read
    // rather than silently dropping the teacher's text.
    if (/^(DIV|P)$/.test(el.tagName) && el.previousSibling) {
      runs.push({ ...marks, text: "\n" });
    }

    const next: Marks = {
      bold: marks.bold || el.dataset.b === "1" || /^(B|STRONG)$/.test(el.tagName),
      italic: marks.italic || el.dataset.i === "1" || /^(I|EM)$/.test(el.tagName),
      code: marks.code || el.dataset.k === "1" || el.tagName === "CODE",
      color: (el.dataset.c as CardColor | undefined) ?? marks.color,
    };

    for (const child of Array.from(el.childNodes)) walk(child, next);
  }

  for (const child of Array.from(root.childNodes)) walk(child, NO_MARKS);
  return runs;
}

function offsetsIn(root: HTMLElement): Offsets | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);

  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}

function selectOffsets(root: HTMLElement, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0;
  let placedStart = false;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0;
    if (!placedStart && at + length >= start) {
      range.setStart(node, start - at);
      placedStart = true;
    }
    if (placedStart && at + length >= end) {
      range.setEnd(node, end - at);
      break;
    }
    at += length;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

// Keeps the panel inside the viewport horizontally, and flips it below the
// selection when there is not enough room above.
function anchorFor(rect: DOMRect): PopoverAnchor {
  const below = rect.top < 110;
  return {
    left: Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100),
    top: below ? rect.bottom + 8 : rect.top - 8,
    below,
  };
}

export type RichTextProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  // The field's default styling, seeded into the text so the teacher can
  // change it. See lib/field-styles.ts.
  style: FieldStyle;
  className?: string;
  multiline?: boolean;
  ariaLabel: string;
};

export function RichText({
  value,
  onChange,
  placeholder,
  style,
  className,
  multiline = false,
  ariaLabel,
}: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Where to put the caret after the next redraw. Set by any edit this
  // component performs itself, since those leave the DOM untouched and the
  // browser's own selection therefore describes the text before the edit.
  const pendingCaret = useRef<Offsets | null>(null);
  const [range, setRange] = useState<Offsets | null>(null);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);

  const markup = applyFieldStyle(value, style);

  function commit(next: string, caret: Offsets) {
    pendingCaret.current = caret;
    onChange(applyFieldStyle(next, style));
  }

  // The beforeinput listener is bound once and would otherwise keep the markup
  // and the callback it was created with, which are one keystroke out of date
  // from its second firing onward.
  const latest = useRef({ markup, commit });

  // Redraw only when the DOM does not already say what `markup` says. After a
  // keystroke it does, so React never touches the field and the caret is left
  // where the browser put it; after a toolbar press or an AI fill it does not,
  // and the field is rebuilt and the selection restored by offset.
  useEffect(() => {
    latest.current = { markup, commit };

    const el = ref.current;
    if (!el) return;

    const caret = pendingCaret.current;
    pendingCaret.current = null;

    // A field emptied by hand can be left holding a stray <br>, which serialises
    // to nothing but still defeats the :empty placeholder rule.
    const stale =
      serialiseRuns(domToRuns(el)) !== markup ||
      (markup === "" && el.innerHTML !== "");

    const focused = document.activeElement === el;
    const target = caret ?? (stale && focused ? offsetsIn(el) : null);

    if (stale) el.innerHTML = runsToHtml(parseInlineMarkup(markup));
    if (target && focused) selectOffsets(el, target.start, target.end);
  });

  // Typing is intercepted rather than read back off the DOM, so that a
  // character typed at the very start of a styled field inherits that field's
  // marks instead of landing outside every span as unstyled text.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleBeforeInput(event: InputEvent) {
      if (event.isComposing) return;
      if (event.inputType !== "insertText" || event.data == null) return;

      const offsets = offsetsIn(el as HTMLElement);
      if (!offsets) return;

      event.preventDefault();
      const caret = offsets.start + event.data.length;
      const { markup: current, commit: send } = latest.current;
      send(replaceRange(current, offsets.start, offsets.end, event.data), {
        start: caret,
        end: caret,
      });
    }

    el.addEventListener("beforeinput", handleBeforeInput);
    return () => el.removeEventListener("beforeinput", handleBeforeInput);
  }, []);

  // Deletions, drag-drop and IME composition are left to the browser and read
  // back here — none of them can produce text that has no marks.
  function handleInput() {
    const el = ref.current;
    if (!el) return;
    const next = serialiseRuns(domToRuns(el));
    if (next !== markup) onChange(applyFieldStyle(next, style));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const el = ref.current;
    if (!el) return;

    if (event.key === "Enter") {
      event.preventDefault();
      if (!multiline) return;
      const offsets = offsetsIn(el);
      if (!offsets) return;
      const caret = offsets.start + 1;
      commit(replaceRange(markup, offsets.start, offsets.end, "\n"), {
        start: caret,
        end: caret,
      });
      return;
    }

    // The browser's own bold and italic would insert <b>/<i>, which is a
    // second, invisible way to say what the markup already says.
    const shortcut = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (shortcut && (event.key === "b" || event.key === "i")) {
      event.preventDefault();
      const offsets = offsetsIn(el);
      if (!offsets || offsets.start === offsets.end) return;
      commit(
        toggleEmphasis(
          markup,
          offsets.start,
          offsets.end,
          event.key === "b" ? "bold" : "italic",
        ),
        offsets,
      );
    }
  }

  function handlePaste(event: React.ClipboardEvent) {
    event.preventDefault();
    const el = ref.current;
    if (!el) return;

    // Plain text only. Pasted HTML would arrive with styling this editor has
    // no way to store, and it would survive in the DOM looking editable.
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n");
    const pasted = multiline ? text : text.replace(/\n+/g, " ");

    const offsets = offsetsIn(el);
    if (!offsets) return;
    const caret = offsets.start + pasted.length;
    commit(replaceRange(markup, offsets.start, offsets.end, pasted), {
      start: caret,
      end: caret,
    });
  }

  // Tracked on the document because a drag that ends outside the field still
  // changes what is selected inside it.
  useEffect(() => {
    function handleSelectionChange() {
      const el = ref.current;
      if (!el || document.activeElement !== el) {
        setRange(null);
        return;
      }

      const offsets = offsetsIn(el);
      if (!offsets || offsets.start === offsets.end) {
        setRange(null);
        return;
      }

      setRange(offsets);
      const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
      if (rect && rect.width + rect.height > 0) setAnchor(anchorFor(rect));
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        data-placeholder={placeholder}
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => setRange(null)}
        className={cn(baseClass, className)}
      />

      {range &&
        anchor &&
        createPortal(
          <FormatPopover
            marks={marksInRange(markup, range.start, range.end)}
            anchor={anchor}
            onEmphasis={(mark) =>
              commit(toggleEmphasis(markup, range.start, range.end, mark), range)
            }
            onColor={(color) =>
              commit(setColor(markup, range.start, range.end, color), range)
            }
          />,
          document.body,
        )}
    </>
  );
}
