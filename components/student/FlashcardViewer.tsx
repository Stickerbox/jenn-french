"use client";

import { useEffect, useRef, useState } from "react";
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

  // The dialog takes focus on open, which `aria-modal` asks for anyway and
  // which two other things here depend on. The keydown guard above needs the
  // focused element to NOT be a button, or Space and Enter reach the deck tile
  // still focused behind the overlay instead of flipping. And with the flip
  // wrapper a plain div — see below for why it must stay one — this is what
  // keeps the keyboard able to flip at all.
  //
  // A ref and an effect rather than `autoFocus`, which React only honours on
  // form controls.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Remembered before the dialog takes it, and given back on close: the deck
    // is a grid of twenty tiles and dropping focus to <body> makes the reader
    // tab through the header, the chips and everything above card twelve to
    // reach card twelve again.
    //
    // Whatever held focus, not a `triggerRef` to a known button the way
    // CardDateNav and AdminDatePicker do it — the trigger here is one tile out
    // of a mapped grid, so the ref would have to be threaded back through
    // DeckTab's `show`. The difference shows on Safari, which does not focus a
    // button on click: `opener` is <body> there, and the restore is a no-op.
    // That costs nothing, because a reader who never had focus on the tile has
    // none to be returned. The keyboard path, which is the one this is for,
    // always focuses the tile it activates.
    //
    // `isConnected` because the close may be a DELETE — the tile that opened
    // this card is gone by then, and focusing a detached node silently does
    // nothing while reading as though it worked.
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

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
        // Only when the DIALOG ITSELF holds focus. This listener is on
        // `document`, and preventDefault on keydown cancels the browser's own
        // activation of the focused element — without a guard, tabbing to
        // Close and pressing Enter flips the card instead of closing, and the
        // same kills every other button in here.
        //
        // The test is "is the dialog focused" and NOT "is a button focused",
        // which was the first cut and let two cases through. Focus is on the
        // deck tile behind the overlay until the effect above moves it, and
        // the browser drops focus to <body> whenever a focused control is
        // disabled or unmounted — which `‹`, `›`, the trash and Confirm all do
        // to themselves. Neither <body> nor a tile is this dialog, and paging
        // to the last card with Enter must not make the next Enter flip it.
        if (document.activeElement !== dialogRef.current) return;
        event.preventDefault();
        setFlipped((value) => !value);
      }

      if (event.key === "Tab") {
        // `aria-modal` is a hint to assistive tech and does nothing to the tab
        // order, and the overlay is opaque — so without this, Shift+Tab off
        // the dialog reaches the deck tile painted UNDERNEATH it, where Enter
        // fires show() and re-stamps another card's lastViewedAt. That is the
        // same failure the Space/Enter guard above closes, arriving by the
        // other door.
        const dialog = dialogRef.current;
        if (!dialog) return;

        // Every focusable in here is a button, and a disabled arrow at an end
        // of the deck is not one of them.
        const stops = Array.from(
          dialog.querySelectorAll<HTMLElement>("button:not([disabled])"),
        );
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first || !last) return;

        const active = document.activeElement;
        // Focus sitting on the dialog itself — on open, or after a click on
        // the card — and focus that has fallen out of it entirely, which is
        // where the browser leaves it when a focused button becomes disabled
        // or unmounts, both enter at the near end rather than escaping.
        if (active === dialog || !dialog.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
          return;
        }

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
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
      //
      // The reset must be done by hand here. `cards` is the pre-delete array
      // this call closed over, so for any card but the last one `Math.min`
      // returns the index it was already on: the prop does not change, the
      // render-phase reset above never fires, and `cards[index]` is
      // nonetheless a DIFFERENT card once the deck reloads. Deleting a flipped
      // card would otherwise show the next one with its answer already up.
      setFlipped(false);
      if (cards.length <= 1) onClose();
      else onIndex(Math.min(index, cards.length - 2));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      // Focusable by script and not by Tab: this is where focus lands on open,
      // and where it returns when a click falls on the card, which is not
      // itself focusable. It must not become another stop in the tab order.
      tabIndex={-1}
      // The name follows the face on show. A dialog named for the front while
      // the back is up describes a card the reader is not looking at.
      aria-label={flipped ? card.back : card.front}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--card-page-bg)] focus:outline-none"
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
        {/* A plain div, and it must stay one. `role="button"` here was tried
            and reverted: ARIA makes a button's children presentational, so the
            role plus a label would expose the whole card as the single word
            "Flip" — front, back and note all dropped, and the aria-hidden pair
            below rendered dead. The keyboard is served instead by the focused
            dialog above, which the document listener flips on Space or Enter,
            and by the Flip button below it. */}
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
            {/* Each face leaves the accessibility tree when it is the one
                nobody is looking at. `backface-visibility` hides pixels, not
                content: without this a screen reader announces the answer
                beside the question, which is the whole flip-to-reveal design
                and the revision ordering built on it. */}
            <div className={faceClass} aria-hidden={flipped}>
              <p className="font-[family-name:var(--card-font-serif)] text-3xl text-[var(--card-ink)]">
                {card.front}
              </p>
            </div>

            <div
              className={cn(faceClass, "[transform:rotateY(180deg)]")}
              aria-hidden={!flipped}
            >
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

      {/* The answer, spoken when it is revealed. The two faces above cannot do
          this themselves: toggling `aria-hidden` is an attribute change, and a
          live region's default `aria-relevant` covers additions and text —
          iOS VoiceOver commonly says nothing at all, and that is the device
          most of these students read on. Here the nodes are genuinely ADDED on
          the flip, which is the trigger every screen reader honours.

          Empty until flipped, so opening a card announces the question once,
          through the dialog's own name, rather than twice. The faces stay
          where they are because the 3D flip needs both of them present.

          The cost, stated plainly: while flipped, the answer is in the tree
          twice — here and on the face, which aria-hidden has just admitted.
          There is no way to have a region announce without also being
          readable. A reader swiping the flipped card hears one short phrase
          again; the alternative is a flip that says nothing on the device most
          of them use. The note is deliberately NOT repeated — it is on the
          face, and it is the long half. */}
      <div className="sr-only" aria-live="polite">
        {flipped && <p>{card.back}</p>}
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
            // The full sentence for a screen reader, the one word on screen.
            // Both dictionaries keep the visible label as the first words of
            // the spoken one, so a voice-control user saying what they can see
            // still reaches the button.
            aria-label={t.flipHint}
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
