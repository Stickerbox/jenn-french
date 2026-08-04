"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/file-size";

// The staging control for a file that cannot be pasted. HtmlPasteBox is the
// right shape for a document — the markup is text and the clipboard carries it
// — and the wrong one for a PDF, whose bytes only arrive as a file.
//
// It hands the File up unread. Enforcing a size cap here would mean knowing
// which cap applies, and that is a question about the file's kind, which the
// caller resolves: 2 MB of HTML and 3 MB of PDF are different numbers next to
// different validators.
export function FileDropZone({
  fileName,
  fileSize,
  hasExisting,
  accept,
  inputLabel,
  emptyHint,
  existingHint,
  onFile,
}: {
  fileName: string | null;
  fileSize: number | null;
  hasExisting: boolean;
  accept: string;
  inputLabel: string;
  emptyHint: string;
  existingHint: string;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change event, which
    // is how a retry after an error-and-fix works.
    event.target.value = "";
    if (file) onFile(file);
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      // No role="button": this is a label wrapping a real file input, so the
      // keyboard and screen-reader affordance is the input's own.
      className={cn(
        "mt-1 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm font-normal transition-colors",
        over
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-field-border)] bg-[var(--color-field)]",
        "text-[var(--color-ink-muted)]",
      )}
    >
      <input
        type="file"
        accept={accept}
        aria-label={inputLabel}
        onChange={handleChange}
        className="sr-only"
      />
      {fileName ? (
        <span>
          {fileName}
          {fileSize !== null && ` — ${formatFileSize(fileSize)}`}
        </span>
      ) : (
        <span>{hasExisting ? existingHint : emptyHint}</span>
      )}
    </label>
  );
}
