"use client";

import { useEffect, useRef } from "react";

// Fires a seen action once, on mount, and renders nothing.
//
// The ref rather than an empty dependency array: React runs an effect twice in
// development under StrictMode, and this writes to the database. The action is
// idempotent, so the second write is harmless — but a stray write is still a
// stray write, and the guard costs one line.
//
// Fired WITHOUT awaiting, matching how DeckTab fires markFlashcardViewed. The
// reader is already looking at the tab; nothing on screen waits for this.
export function MarkTabSeen({ onSeen }: { onSeen: () => Promise<void> }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Swallowed deliberately. There is nothing to show a reader whose
    // watermark did not move, and an unhandled rejection in the console is
    // worse than a dot that clears on the next visit instead.
    void onSeen().catch(() => {});
  }, [onSeen]);

  return null;
}
