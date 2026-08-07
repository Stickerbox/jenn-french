"use client";

import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { validatePageHtml, byteLength } from "@/lib/page-html";
import { formatFileSize } from "@/lib/file-size";
import { cardFocusRing } from "@/components/card-styles";
import { accentFocusRing } from "@/components/ui/field";

export type PasteTone = "admin" | "card";

// Two skins for the two palettes, the same reason FilterChip has them.
const TONES: Record<
  PasteTone,
  { box: string; text: string; error: string; focus: string; ring: string }
> = {
  admin: {
    box: "border-[var(--color-field-border)] bg-[var(--color-field)]",
    text: "text-[var(--color-ink-muted)]",
    error: "text-[var(--color-accent)]",
    focus: "focus:border-[var(--color-accent)]",
    ring: accentFocusRing,
  },
  card: {
    box: "border-[var(--card-line)] bg-[var(--card-paper)]",
    text: "text-[var(--card-moss)]",
    error: "text-[var(--card-rouge)]",
    // Was hard-coded to --color-accent regardless of tone, which put the
    // admin's lilac focus border on the student shelf's own upload box —
    // the one place this tone split exists specifically to prevent.
    focus: "focus:border-[var(--card-bleu)]",
    ring: cardFocusRing,
  },
};

export type PasteLabels = {
  prompt: string;
  // Takes the formatted size so the sentence around it can be either language.
  accepted: (size: string) => string;
  ariaLabel: string;
};

// Paste a whole document in; never see it again.
//
// onPaste reads the clipboard directly and calls preventDefault(), so the text
// never lands in the textarea at all. The obvious alternative — accept it and
// clear the field — shows the markup for one frame and then blanks it, which
// looks like the paste failed.
//
// Validation is validatePageHtml, unchanged and reused: it already enforces the
// 2 MB byte cap and already rejects a string with no "<" in it, which is the
// whole of "check if it is HTML". A second rule beside it would be a second
// thing to keep in step.
//
// The caller decides what a valid document means. The create forms save it
// immediately; the edit form holds it in state until Save. That is why this
// hands the html out rather than submitting anything itself.
export function HtmlPasteBox({
  labels,
  tone,
  onHtml,
  disabled = false,
  errorFor = (message) => message,
}: {
  labels: PasteLabels;
  tone: PasteTone;
  onHtml: (html: string) => void;
  // Shuts the box outright. Added for NewPageForm, where the paste IS the
  // submit and there is no button to disable instead — a page has to have an
  // audience, and a paste that silently did nothing would read as the box
  // being broken rather than as a step not yet taken.
  //
  // The textarea's own `disabled` does the work a caller can see; the two
  // guards below are what make it true rather than merely apparent. A
  // disabled field fires no paste and no change event in any current browser,
  // so both are belt-and-braces — but this is the one control in the app whose
  // event handler *is* the submit, and "no current browser" is a weaker
  // guarantee than a return statement.
  disabled?: boolean;
  // The student surface collapses every message to one French sentence: the
  // action's own messages are written for Jenn and are in English.
  errorFor?: (message: string) => string;
}) {
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function accept(text: string) {
    setError(null);
    const result = validatePageHtml(text);
    if (!result.ok) {
      setSize(null);
      setError(errorFor(result.error));
      return;
    }
    setSize(byteLength(result.html));
    onHtml(result.html);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    // Cancelled so the markup never enters the field. text/plain rather than
    // text/html: the clipboard's html flavour is the browser's re-serialisation
    // of a rendered selection, not the file she copied.
    event.preventDefault();
    if (disabled) return;
    accept(event.clipboardData.getData("text/plain"));
  }

  // Text can still arrive without a paste event — dragged in, or typed by a
  // mobile keyboard's suggestion bar. Same treatment, and the field is blanked
  // straight afterwards so it never displays what it received.
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    event.target.value = "";
    if (disabled) return;
    if (text.trim()) accept(text);
  }

  return (
    <div>
      <textarea
        onPaste={handlePaste}
        onChange={handleChange}
        disabled={disabled}
        aria-label={labels.ariaLabel}
        rows={3}
        // resize-none: it never holds text, so a drag handle offers nothing.
        className={cn(
          "mt-1 block w-full resize-none rounded-xl border-2 border-dashed px-4 py-6 text-center font-[family-name:var(--font-body)] text-sm transition-colors duration-150 focus:outline-none motion-reduce:transition-none",
          TONES[tone].box,
          TONES[tone].text,
          TONES[tone].focus,
          TONES[tone].ring,
          disabled && "cursor-not-allowed opacity-50",
        )}
        placeholder={labels.prompt}
        defaultValue=""
      />

      {size !== null && (
        <p className={cn("mt-2 text-center text-sm", TONES[tone].text)}>
          {labels.accepted(formatFileSize(size))}
        </p>
      )}

      {error && (
        <p role="alert" className={cn("mt-2 text-center text-sm", TONES[tone].error)}>
          {error}
        </p>
      )}
    </div>
  );
}
