"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

export function HtmlDropZone({
  fileName,
  hasExisting,
  onFile,
  onError,
}: {
  fileName: string | null;
  // Distinguishes "nothing chosen and nothing stored" on the create form from
  // "nothing chosen this session, but a file is already published" on the
  // edit screen. Without it the edit screen would look empty and unsaved.
  hasExisting: boolean;
  onFile: (file: File, text: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function accept(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PAGE_BYTES) {
      onError("That page is larger than 2 MB.");
      return;
    }
    onFile(file, await file.text());
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    await accept(event.target.files?.[0]);
    // Cleared so choosing the same file twice in a row still fires a change.
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    await accept(event.dataTransfer.files?.[0]);
  }

  const status = fileName
    ? fileName
    : hasExisting
      ? "A file is published. Drop a new one to replace it."
      : "Drop an HTML file here, or click to choose one";

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "mt-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragging
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-field-border)] bg-[var(--color-field)]",
      )}
    >
      <p className="text-sm font-normal text-[var(--color-ink-muted)]">
        {status}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 rounded-full border border-[var(--color-field-border)] bg-[var(--color-bg)] px-5 py-2 text-sm font-medium text-[var(--color-ink)] transition-opacity hover:opacity-80"
      >
        {fileName || hasExisting ? "Choose a different file" : "Choose a file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm,text/html"
        onChange={handleChange}
        className="sr-only"
      />
    </div>
  );
}
