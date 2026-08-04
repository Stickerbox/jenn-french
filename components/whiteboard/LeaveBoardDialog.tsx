"use client";

import { useEffect } from "react";

// Asked when a click is about to take her off a board she has not saved.
//
// This one IS aria-modal, unlike ChatWindow, and the contrast is the reason it
// is written down: the point of the chat panel is that the page stays readable
// behind it, and the point of this one is that the page must not be touched
// until she answers — every control behind it is another way to lose the board
// she is being asked about.
export function LeaveBoardDialog({
  saving,
  error,
  onSave,
  onDiscard,
  onCancel,
}: {
  saving: boolean;
  // Rendered in here rather than only behind the backdrop: a failed save must
  // leave her somewhere she can act on it, and the buttons are in here.
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Not while a save is in flight: Escape would strand a request whose
      // result she can no longer see.
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-board-title"
        // The backdrop closes; a click on the card must not bubble up to it.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[420px] rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-6 shadow-[var(--card-shadow)]"
      >
        <h2
          id="leave-board-title"
          className="mb-2 font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]"
        >
          Terminer ce tableau&nbsp;?
        </h2>
        <p className="mb-5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          Vous quittez cette page. Ce tableau n&apos;est pas encore enregistré.
        </p>

        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--card-rouge)]">
            {error}
          </p>
        )}

        {/* Stacked rather than in a row: three labels of this length wrap badly
            side by side on a phone, and the destructive one should not sit
            where a thumb reaching for the primary one lands. */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Fermer et enregistrer"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-full border border-[var(--card-line)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-rouge)] disabled:opacity-50"
          >
            Fermer sans enregistrer
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-5 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] underline disabled:opacity-50"
          >
            Rester sur le tableau
          </button>
        </div>
      </div>
    </div>
  );
}
