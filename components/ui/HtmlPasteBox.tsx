"use client";

import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";
import { validatePageHtml, byteLength } from "@/lib/page-html";
import { formatFileSize } from "@/lib/file-size";

export type PasteTone = "admin" | "card";

// Two skins for the two palettes, the same reason FilterChip has them.
const TONES: Record<PasteTone, { box: string; text: string; error: string }> = {
  admin: {
    box: "border-[var(--color-field-border)] bg-[var(--color-field)]",
    text: "text-[var(--color-ink-muted)]",
    error: "text-[var(--color-accent)]",
  },
  card: {
    box: "border-[var(--card-line)] bg-[var(--card-paper)]",
    text: "text-[var(--card-moss)]",
    error: "text-[var(--card-rouge)]",
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
  errorFor = (message) => message,
}: {
  labels: PasteLabels;
  tone: PasteTone;
  onHtml: (html: string) => void;
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
    accept(event.clipboardData.getData("text/plain"));
  }

  // Text can still arrive without a paste event — dragged in, or typed by a
  // mobile keyboard's suggestion bar. Same treatment, and the field is blanked
  // straight afterwards so it never displays what it received.
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value;
    event.target.value = "";
    if (text.trim()) accept(text);
  }

  return (
    <div>
      <textarea
        onPaste={handlePaste}
        onChange={handleChange}
        aria-label={labels.ariaLabel}
        rows={3}
        // resize-none: it never holds text, so a drag handle offers nothing.
        className={cn(
          "mt-1 block w-full resize-none rounded-xl border-2 border-dashed px-4 py-6 text-center font-[family-name:var(--font-body)] text-sm focus:border-[var(--color-accent)] focus:outline-none",
          TONES[tone].box,
          TONES[tone].text,
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
