"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import { cardDateLabel, cardFocusRing } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

const controlClass = cn(
  "flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] disabled:opacity-40 motion-reduce:transition-none",
  cardFocusRing,
);

const faceClass =
  "col-start-1 row-start-1 flex flex-col items-center justify-center rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-8 text-center shadow-[var(--card-shadow)] [backface-visibility:hidden]";

// One card, full screen, over the deck.
//
// An OVERLAY and not a route, following BoardViewer: a card is not a
// bookmarkable thing and the deck is the unit a reader navigates. It takes the
// deck already ordered, so Random and À réviser carry in from the shelf rather
// than being recomputed here against a different seed.
export function FlashcardViewer({
  cards,
  index,
  locale,
  onIndex,
  onClose,
  onDelete,
}: {
  // Already ordered by the shelf.
  cards: FlashcardRow[];
  index: number;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  // Stamping lastViewedAt happens in DeckTab's own handler, NOT here — see
  // its `show`. This component only reports which card should be current.
  onIndex: (next: number) => void;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;

  // Hides the two fixed corner buttons below `md` for the life of this mount,
  // the rule AddSheet, ChatPanel and BoardViewer all follow. Without it the
  // shelf's + and the chat bubble paint over the card's own controls.
  useOverlayLock();

  const [flipped, setFlipped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Moving to a card shows its FRONT, and clears a half-pressed delete. A card
  // that opened already flipped would answer a question the reader had not
  // been asked.
  //
  // Adjusted during render rather than in an effect, which is the shape
  // NewPageForm and PageEditOverlay already use for the same job:
  // react-hooks/set-state-in-effect rejects the effect form, and an effect
  // would paint the previous card's flipped face for one frame before
  // correcting it.
  const [lastIndex, setLastIndex] = useState(index);
  if (lastIndex !== index) {
    setLastIndex(index);
    setFlipped(false);
    setConfirming(false);
  }

  const card = cards[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (event.key === "ArrowRight" && index < cards.length - 1) {
        onIndex(index + 1);
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, cards.length, onIndex, onClose]);

  if (!card) return null;

  async function remove() {
    setBusy(true);
    try {
      await onDelete(card.id);
      // The deck is one shorter now. Move to the card that took this one's
      // place, or close if it was the last — a viewer left open on an empty
      // frame reads as a crash.
      if (cards.length <= 1) onClose();
      else onIndex(Math.min(index, cards.length - 2));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.front}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--card-page-bg)]"
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <span className={cardDateLabel}>
          {formatLongDate(card.createdAt, locale)}
        </span>

        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className={cn(controlClass, "text-[var(--card-rouge)]")}
              >
                {t.deleteConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={controlClass}
              >
                {t.deleteCancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t.delete}
              className={controlClass}
            >
              <TrashIcon />
            </button>
          )}
          <button type="button" onClick={onClose} className={controlClass}>
            {t.close}
          </button>
        </div>
      </div>

      {/* The same flip the daily card uses — perspective on the wrapper, one
          grid cell holding two faces, the back pre-rotated. */}
      <div className="flex flex-1 items-center justify-center px-4">
        <div
          className="w-full max-w-[560px] cursor-pointer [perspective:2000px]"
          onClick={() => setFlipped((value) => !value)}
        >
          <motion.div
            className="grid min-h-[320px] w-full grid-cols-1"
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0.15, 0.2, 1] }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className={faceClass}>
              <p className="font-[family-name:var(--card-font-serif)] text-3xl text-[var(--card-ink)]">
                {card.front}
              </p>
            </div>

            <div className={cn(faceClass, "[transform:rotateY(180deg)]")}>
              <p className="font-[family-name:var(--card-font-serif)] text-3xl text-[var(--card-ink)]">
                {card.back}
              </p>
              {card.note && (
                <p className="mt-4 font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
                  {card.note}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label={t.previous}
          className={controlClass}
        >
          ‹
        </button>

        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
            {t.position(index + 1, cards.length)}
          </span>
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            className={controlClass}
          >
            {t.flip}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onIndex(index + 1)}
          disabled={index >= cards.length - 1}
          aria-label={t.next}
          className={controlClass}
        >
          ›
        </button>
      </div>
    </div>
  );
}

// Local to the file that draws it, the same way ShellBar keeps its own back
// arrow rather than an icon module for a handful of one-off shapes.
function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}
