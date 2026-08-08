"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { cardDateLabel, deckFacePill } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

// The two faces share ONE grid cell, so they are one box measured once —
// flipping a card therefore moves nothing else in the grid. 160px is the height
// the tile already had and the reason is unchanged: the word is centred in
// whatever the date leaves, and at the old 132px there was not enough left
// under the date for the centring to read as centring.
const faceClass =
  "col-start-1 row-start-1 flex min-h-[160px] flex-col rounded-2xl border p-4 shadow-[var(--card-shadow)] [backface-visibility:hidden]";

// `break-words` because this is text-2xl inside a tile as narrow as ~140px on a
// two-column phone grid, and a long French infinitive would otherwise run out
// of it. Colour is per-face: ink on the paper front, white on the lilac back.
const faceWord =
  "flex flex-1 items-center justify-center break-words px-1 text-center font-[family-name:var(--card-font-serif)] text-2xl font-bold";

// The back's own control skin. tileActionClass is the card palette's blue on
// cream and is illegible on lilac, so this is its sibling rather than an
// override of it — and its focus ring offsets against the accent it sits on.
//
// 36px, not the 44px this page's controls otherwise reach, and this is the
// third stated exception to that rule beside a page tile's action icons and the
// month calendar's grid. The reason is the same one tileActionClass gives: the
// confirm state puts TWO text-labelled pills in a row inside a tile as narrow
// as ~140px, and "Supprimer ?" carries a non-breaking space so it cannot wrap
// at all. At 44px with 12px text the pair measures wider than the tile and
// spills onto the page background, where white text is invisible. 11px text and
// px-2 are part of the same measurement — do not grow either without redoing
// it against a 320px viewport.
const backControl = cn(
  "flex h-9 items-center justify-center rounded-full px-2 font-[family-name:var(--card-font-serif)] text-[11px] text-white transition-colors duration-150 hover:bg-white/20 disabled:opacity-50 motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-accent)]",
);

// One card in the deck grid, flipping in place.
//
// It replaced a full-screen overlay on 2026-08-07, and the removal was a net
// deletion: the overlay's focus trap, its document keydown listener and its
// Space/Enter guard all existed because a role="dialog" div is neither
// focusable nor activatable by the browser. This is a real <button>, so the
// browser does all three.
export function DeckCard({
  card,
  flipped,
  locale,
  onFlip,
  onDelete,
}: {
  card: FlashcardRow;
  // Controlled by DeckTab, which holds every tile's flip in one Set keyed by
  // card id — so a re-sort can clear them all, and so a card that moves in the
  // grid keeps its own face. The old overlay keyed on an INDEX into the ordered
  // array, which is why it had to close itself whenever the sort changed.
  flipped: boolean;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  // Stamping lastViewedAt happens in DeckTab's handler, NOT here — see its
  // `toggleFlip`. This component only reports that the reader pressed the card.
  onFlip: () => void;
  onDelete: () => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this file are CSS and reach none of
  // it. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Turning a card back to its front puts an armed delete away with it. A
  // half-pressed confirm left cocked would fire on the next reveal, from a
  // gesture the reader made about something else.
  //
  // Adjusted during render rather than in an effect, the shape NewPageForm and
  // PageEditor already use: react-hooks/set-state-in-effect rejects the effect
  // form, and an effect would paint the armed state for one frame first.
  const [lastFlipped, setLastFlipped] = useState(flipped);
  if (lastFlipped !== flipped) {
    setLastFlipped(flipped);
    if (!flipped) setConfirming(false);
  }

  // Arming and disarming the delete each unmount the control that was pressed,
  // and the browser drops focus to <body> whenever a focused element unmounts.
  // The deleted overlay named this exact failure in its Tab handler and caught
  // it with a focus trap this tile has no need for; without something here, a
  // keyboard user who arms a delete on card twelve has to Tab from the top of
  // the document — header, tab strip, sort chips and eleven tiles — to reach
  // "Supprimer ?".
  //
  // The first run is skipped: on mount `confirming` is already false, and
  // without the guard every face-up tile on the page would fight for focus as
  // it hydrated. Both refs are optional-chained because the whole band is
  // unmounted while the card shows its front, which is exactly the state the
  // render-phase reset above puts it in.
  const confirmRef = useRef<HTMLButtonElement>(null);
  const trashRef = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    (confirming ? confirmRef : trashRef).current?.focus();
  }, [confirming]);

  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      // The row leaves through the grid's AnimatePresence exit, because
      // deleteFlashcard revalidates — so this component may already be
      // unmounting. Resetting anyway costs nothing and is correct if the
      // action failed and the tile is still here.
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      className={cn(
        // `group` is what lets the front face light on hover. The button that
        // takes the click is transparent and covers the faces, so the face
        // cannot carry its own :hover — and without one this would be the only
        // tile grid in the app with no pointer affordance at all.
        "group relative h-full [perspective:2000px]",
        // The ring goes on the FRAME and is scoped to the flip button by its
        // data attribute. Two reasons: the flip button's own box is a sr-only
        // label, so the browser's outline would ring nothing a sighted keyboard
        // user could see; and an unscoped has-[button:...] would light the whole
        // tile when the small trash inside it took focus, which already draws
        // its own ring. PageTile's has-[a:focus-visible] is the precedent.
        "has-[[data-flip]:focus-visible]:rounded-2xl has-[[data-flip]:focus-visible]:ring-2 has-[[data-flip]:focus-visible]:ring-[var(--card-bleu)] has-[[data-flip]:focus-visible]:ring-offset-2 has-[[data-flip]:focus-visible]:ring-offset-[var(--card-paper)]",
      )}
    >
      <motion.div
        className="grid h-full w-full grid-cols-1"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.5,
          ease: [0.4, 0.15, 0.2, 1],
        }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Each face leaves the accessibility tree when it is the one nobody is
            looking at. `backface-visibility` hides pixels, not content: without
            this a screen reader announces the answer beside the question, which
            is the whole flip-to-reveal design and the revision ordering built
            on it. */}
        <div
          aria-hidden={flipped}
          className={cn(
            faceClass,
            "border-[var(--card-line)] bg-[var(--card-paper)] transition-colors duration-150 group-hover:bg-[var(--card-section)] motion-reduce:transition-none",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cardDateLabel}>
              {formatLongDate(card.createdAt, locale)}
            </span>
            <span
              className={cn(
                deckFacePill,
                "border-[var(--card-line)] text-[var(--card-bleu)]",
              )}
            >
              {t.frontLabel}
            </span>
          </div>
          {/* The front only. A tile that showed the answer would make the deck
              a glossary and the revision order meaningless. */}
          <span className={cn(faceWord, "text-[var(--card-ink)]")}>
            {card.front}
          </span>
        </div>

        {/* The lilac back. This is the app palette (--color-accent) landing on a
            card object, which is the first time the two palettes meet on one
            surface — a deliberate crossing, recorded in the spec, not a merge:
            neither set is renamed or dropped. White on #AC5395 is 4.75:1, which
            is the measurement that value was chosen for.

            The border matches the fill rather than using --card-line: a cream
            line on lilac reads as an artefact.

            pb-12 rather than the face's p-4 reserves the band the delete
            controls sit in — 48px, which is exactly bottom-3 plus their h-9 —
            so a long answer never runs under the trash. */}
        <div
          aria-hidden={!flipped}
          className={cn(
            faceClass,
            "border-[var(--color-accent)] bg-[var(--color-accent)] pb-12 [transform:rotateY(180deg)]",
          )}
        >
          <div className="flex justify-end">
            <span className={cn(deckFacePill, "border-white/50 text-white")}>
              {t.backLabel}
            </span>
          </div>
          <span className={cn(faceWord, "text-white")}>{card.back}</span>
          {/* Full white, NOT white/80. Composited over #AC5395 that is #EEDDEA,
              which measures 3.65:1 — under AA for 12px text. The note is the
              only place a student's own gloss on a word lives and it is already
              set apart by size and italics; it does not need a second, failing
              signal. Measure before dimming this. */}
          {card.note && (
            <p className="line-clamp-2 break-words px-1 text-center font-[family-name:var(--card-font-serif)] text-xs italic text-white">
              {card.note}
            </p>
          )}
        </div>
      </motion.div>

      {/* A real button covering the tile, rather than a button WRAPPING the two
          faces. ARIA makes a button's children presentational, so a wrapper
          would expose the whole card as its own accessible name — front, back
          and note all dropped, and the aria-hidden pair above rendered dead.
          That is the trap the deleted FlashcardViewer recorded after trying
          role="button" and reverting it.

          Space and Enter activate this natively, which is why nothing here
          needs the document keydown listener the overlay carried.

          `aria-pressed` and not a name that changes with the face: the live
          region below announces the answer on the way to the back, but nothing
          announced the way BACK to the front, because removing a node is not a
          trigger any screen reader honours. This is the standard signal for a
          control whose whole job is a two-state toggle. */}
      <button
        type="button"
        data-flip
        aria-pressed={flipped}
        onClick={onFlip}
        className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none"
      >
        <span className="sr-only">{t.flipCard(card.front)}</span>
      </button>

      {/* OUTSIDE the flip wrapper, not inside the back face. The motion.div
          carries a transform and so opens a stacking context: a z-index on a
          control inside it is resolved against its siblings in that context and
          can never rise above the flip button, which is a sibling of the
          motion.div itself. Sitting out here, z-20 does what it reads as.

          `left-3` as well as `right-3`, with wrap: an absolutely positioned box
          with only `right` set is shrink-to-fit and floors at min-content, and
          the confirm pair's min-content is wider than a tile on a phone — so it
          used to spill past the card's left edge onto the cream page, where
          white text is invisible. Bounded, it wraps instead; wrap-REVERSE, and
          `bottom` rather than `top`, so the second line grows UP into the card
          rather than down out of it.

          It fades rather than appearing, and waits out half the flip: the
          controls are white, and rendered on the frame the state changes they
          would sit on the cream FRONT face for a quarter of a second while the
          card is still turning. That is not the "a popover must animate" rule —
          this is neither a popover nor a list row — it is the flip's own
          duration being told to something outside it. */}
      {flipped && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduceMotion ? 0 : 0.2,
            delay: reduceMotion ? 0 : 0.25,
          }}
          className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap-reverse items-center justify-end gap-1.5"
        >
          {confirming ? (
            <>
              <button
                type="button"
                ref={confirmRef}
                onClick={() => void remove()}
                disabled={busy}
                className={backControl}
              >
                {t.deleteConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className={backControl}
              >
                {t.deleteCancel}
              </button>
            </>
          ) : (
            <button
              type="button"
              ref={trashRef}
              onClick={() => setConfirming(true)}
              aria-label={t.delete}
              className={cn(backControl, "w-9 px-0")}
            >
              <TrashIcon />
            </button>
          )}
        </motion.div>
      )}

      {/* The answer, spoken when it is revealed. The two faces cannot do this
          themselves: toggling `aria-hidden` is an attribute change, and a live
          region's default `aria-relevant` covers additions and text — iOS
          VoiceOver commonly says nothing at all, and that is the device most of
          these students read on. Here the node is genuinely ADDED on the flip,
          which is the trigger every screen reader honours.

          Two costs, both accepted and neither hidden. While flipped, the answer
          is in the tree twice — here and on the face, which aria-hidden has
          just admitted; there is no way to have a region announce without also
          being readable. And the front word is read twice on an unflipped tile,
          once from the face and once from the flip button's name: the old tile
          was a button whose children ARIA made presentational, so it said the
          word once. Naming the button is what stops a grid of twenty tiles
          being twenty identical tab stops, and that is worth the repeat.

          The note is deliberately NOT repeated: it is on the face, and it is
          the long half. */}
      <div className="sr-only" aria-live="polite">
        {flipped && <p>{card.back}</p>}
      </div>
    </div>
  );
}
