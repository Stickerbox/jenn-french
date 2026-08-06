"use client";

import { useEffect, type ReactNode } from "react";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import { accentFocusRing } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// The modal a chosen form renders into. aria-modal here, unlike ChatWindow,
// which deliberately is not one: a chat panel exists so the card stays readable
// behind it, and this exists to be filled in and dismissed.
export function AddSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Registers this sheet as an open overlay for the life of its mount, so the
  // two corner FABs — otherwise `z-50`, same as this — hide below `md` instead
  // of painting on top of its own submit button.
  useOverlayLock();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      {/* Its own element rather than an onClick on the wrapper: a click that
          started inside the panel and ended on the wrapper would close a form
          mid-selection. */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Same rise-on-mobile/pop-on-desktop pair as ChatPanel, and for the
        // same reason: this sheet also arrives from the bottom below `sm`
        // (items-end above) and floats centred above it (sm:items-center) —
        // no new keyframe, just the two ChatPanel already uses, swapping at
        // the same breakpoint this component's own layout swaps at.
        className="relative z-10 max-h-[85vh] w-full max-w-[480px] animate-[panel-rise_320ms_ease-out] overflow-y-auto rounded-2xl border border-[var(--color-field-border)] bg-[var(--color-bg)] p-6 shadow-2xl motion-reduce:animate-none sm:animate-[panel-pop_220ms_ease-out]"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl italic text-[var(--color-ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-field)] hover:text-[var(--color-ink)] motion-reduce:transition-none",
              accentFocusRing,
            )}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
