"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelLabels = { close: string; back: string };

// One tree for both sizes, driven entirely by CSS. Deliberately no matchMedia
// read: that is another value that differs between the server and the browser,
// and this component is one of the things that has to stay hydration-safe.
//
// Below md: full screen, and `aside` and `children` take turns — which one
// shows is the caller's `showAside`.
// At md and up: a floating panel with both visible side by side, and
// `showAside` is ignored.
export function ChatPanel({
  title,
  labels,
  onClose,
  onBack,
  aside,
  showAside = true,
  children,
}: {
  title: string;
  labels: PanelLabels;
  onClose: () => void;
  // Provided only when there is somewhere to go back TO — the inbox, on mobile,
  // with a conversation open. A student has no second level, so they never get
  // one, and a back arrow that closed the chat would be a second X.
  onBack?: () => void;
  aside?: ReactNode;
  showAside?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      // Still deliberately not aria-modal at desktop size: the point of a
      // floating panel is that the page stays readable behind it while she
      // types. Below md it is full screen and there is nothing behind it.
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)] focus:outline-none",
        "md:inset-auto md:bottom-24 md:right-4 md:max-h-[70vh] md:h-[560px]",
        "md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[var(--color-field-border)] md:shadow-2xl",
        // The inbox needs room for two panes; a student's single conversation
        // keeps the width it has today.
        aside ? "md:w-[720px]" : "md:w-[380px]",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-field-border)] px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={labels.back}
            // md:hidden because at desktop size both panes are visible and
            // there is nothing to go back to.
            className="text-lg leading-none text-[var(--color-ink-muted)] md:hidden"
          >
            ←
          </button>
        )}

        <span className="flex-1 truncate font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
          {title}
        </span>

        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          // When a back arrow is showing on a phone, the X steps aside: the
          // list behind it is where closing belongs.
          className={cn(
            "text-lg leading-none text-[var(--color-ink-muted)]",
            onBack && "hidden md:block",
          )}
        >
          ×
        </button>
      </header>

      {/* min-h-0 on both of these: without it a flex child refuses to shrink
          below its content and the inner overflow-y-auto never scrolls. */}
      <div className="flex min-h-0 flex-1 md:flex-row">
        {aside && (
          <aside
            className={cn(
              "min-h-0 flex-col border-[var(--color-field-border)] md:flex md:w-[260px] md:shrink-0 md:border-r",
              showAside ? "flex flex-1" : "hidden",
            )}
          >
            {aside}
          </aside>
        )}

        <section
          className={cn(
            "min-h-0 flex-col md:flex md:flex-1",
            aside && showAside ? "hidden" : "flex flex-1",
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
