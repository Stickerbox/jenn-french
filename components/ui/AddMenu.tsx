"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export type AddChoice = { key: string; label: string };

// The two-or-three-item popover a FAB opens. It knows nothing about students,
// links or pages — the caller names the choices and handles the answer.
//
// Dismissal is a full-screen transparent backdrop rather than a document-level
// pointerdown listener: it is one element, it needs no ref, and it gives the
// press somewhere to land instead of falling through onto whatever is beneath.
export function AddMenu({
  choices,
  onChoose,
  onDismiss,
  // Was a hardcoded "Fermer" — French unconditionally, on the assumption
  // Jenn's UI was always English and this backdrop button was the one place
  // that slipped through. Now a prop like every other dismiss control, so it
  // follows the same word AddSheet's closeLabel uses.
  dismissLabel,
  className,
}: {
  choices: AddChoice[];
  onChoose: (key: string) => void;
  onDismiss: () => void;
  dismissLabel: string;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div
        role="menu"
        className={cn(
          "fixed z-50 flex min-w-[180px] flex-col overflow-hidden rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] shadow-2xl",
          className,
        )}
      >
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="menuitem"
            onClick={() => onChoose(choice.key)}
            className="px-5 py-3 text-left font-[family-name:var(--font-body)] text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-field)]"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </>
  );
}
