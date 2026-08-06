"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import { accentFocusRing } from "@/components/ui/field";

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

  // The two corner FABs are otherwise `z-50`, same as this panel, and render
  // earlier in the tree — so on a phone they painted on top of the full-screen
  // chat. Locking for the life of this mount is what makes Fab hide itself
  // below md while the panel is open.
  useOverlayLock();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // iOS Safari does not shrink a `fixed inset-0` element when the on-screen
  // keyboard opens: the visual viewport shrinks, the layout viewport (and so
  // `100dvh`) does not, so the header — and the X inside it — get pushed above
  // what she can actually see. Below md only: at md+ the panel already floats
  // clear of the keyboard at bottom-24, and the inline style is cleared there
  // so those classes can take back over.
  const [keyboardRect, setKeyboardRect] = useState<{
    top: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const desktop = window.matchMedia("(min-width: 768px)");

    const update = () => {
      if (desktop.matches) {
        setKeyboardRect(null);
        return;
      }
      setKeyboardRect({ top: viewport.offsetTop, height: viewport.height });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    desktop.addEventListener("change", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

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
        "fixed inset-0 z-[60] flex flex-col bg-[var(--color-bg)] pb-[env(safe-area-inset-bottom)] focus:outline-none",
        // Soft-motion open: a rise on mobile (it arrives from the bottom of
        // the screen), a pop on desktop (it arrives from the corner it floats
        // in). Both collapse to a plain fade under prefers-reduced-motion —
        // see the keyframes in globals.css.
        "animate-[panel-rise_320ms_ease-out] md:animate-[panel-pop_220ms_ease-out] motion-reduce:animate-none",
        "md:inset-auto md:bottom-24 md:right-4 md:max-h-[70vh] md:h-[560px]",
        "md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:border md:border-[var(--color-field-border)] md:shadow-2xl",
        // The inbox needs room for two panes; a student's single conversation
        // keeps the width it has today.
        aside ? "md:w-[720px]" : "md:w-[380px]",
      )}
      style={
        keyboardRect
          ? { top: `${keyboardRect.top}px`, height: `${keyboardRect.height}px` }
          : undefined
      }
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-field-border)] px-4 py-3">
        {onBack ? (
          <>
            {/* One button, not an arrow beside a title: the arrow alone used
                to be the whole hit target, at 14px. md:hidden because at
                desktop size both panes are visible and there is nowhere to go
                back to — the plain span beside it carries the title there
                instead. */}
            <button
              type="button"
              onClick={onBack}
              aria-label={labels.back}
              className={cn(
                "-ml-2 flex min-h-11 flex-1 items-center gap-2 truncate rounded-lg py-2 pl-2 pr-3 text-left transition-colors duration-150 hover:bg-[var(--color-accent-soft)] active:bg-[var(--color-accent-soft)] motion-reduce:transition-none md:hidden",
                accentFocusRing,
              )}
            >
              <span
                aria-hidden="true"
                className="text-lg leading-none text-[var(--color-ink-muted)]"
              >
                ←
              </span>
              <span className="truncate font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
                {title}
              </span>
            </button>
            <span className="hidden flex-1 truncate font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)] md:block">
              {title}
            </span>
          </>
        ) : (
          <span className="flex-1 truncate font-[family-name:var(--font-body)] text-sm font-medium text-[var(--color-ink)]">
            {title}
          </span>
        )}

        {/* Always visible now — back and close are different actions and both
            belong in the header. It used to hide whenever the back arrow
            showed, which left Jenn with no way to close the panel from inside
            a student's conversation on a phone without going back to the list
            first. h-11 w-11 (44px) is the touch target; the glyph itself is
            far smaller. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)] active:bg-[var(--color-accent-soft)] motion-reduce:transition-none",
            accentFocusRing,
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
