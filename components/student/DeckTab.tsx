"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FilterChip } from "@/components/ui/FilterChip";
import { AddSheet } from "@/components/ui/AddSheet";
import { AddFlashcardForm } from "@/components/student/AddFlashcardForm";
import { DeckCard } from "@/components/student/DeckCard";
import { orderFlashcards, type FlashcardSort } from "@/lib/flashcard-order";
import { cardFocusRing, emptyStateText } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type { FlashcardRow } from "@/lib/flashcards";
import { cn } from "@/lib/utils";

export function DeckTab({
  cards,
  isTeacher,
  locale,
  onAdd,
  onDelete,
  onViewed,
}: {
  cards: FlashcardRow[];
  isTeacher: boolean;
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  // The bound addFlashcard. It used to hang off the page-level + FAB beside
  // "add a link" and "add a PDF"; it lives here now, on the one tab where a
  // card is the only thing there is to add.
  onAdd: (input: { front: string; back: string; note: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // The bound markFlashcardViewed. Returns a promise this component
  // deliberately does not await.
  onViewed: (id: string) => Promise<void>;
}) {
  const strings = getStrings(locale);
  const t = strings.student.deck;
  const router = useRouter();
  // framer-motion does NOT read prefers-reduced-motion by itself — the
  // `motion-reduce:` utilities elsewhere in this codebase are CSS and reach
  // none of this. Asking for it and zeroing the duration is the equivalent.
  const reduceMotion = useReducedMotion();
  const motionTransition = {
    duration: reduceMotion ? 0 : 0.3,
    ease: [0.4, 0.15, 0.2, 1] as const,
  };
  const [sort, setSort] = useState<FlashcardSort>("added");
  const [seed, setSeed] = useState(1);
  // Which cards are face up, by ID and not by index. Here rather than inside
  // each tile so a re-sort can clear them all in one line, and so clearing them
  // does not mean remounting a tile and throwing away its own delete-confirm
  // state as a side effect of an unrelated action.
  //
  // Keying on the id is also what lets a flip survive a re-sort at all. The
  // deleted overlay held an `openIndex` into the ordered array, so changing the
  // sort put a DIFFERENT card behind the same number and it had to close.
  //
  // `new Set<string>()` with the argument spelled out, not a bare `new Set()`:
  // an empty Set literal infers Set<unknown>, and contextual inference through
  // SetStateAction's union does not reliably rescue it.
  const [flippedIds, setFlippedIds] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [adding, setAdding] = useState(false);

  function chooseSort(next: FlashcardSort) {
    // Pressing Random again reshuffles, which is what a reader expects of it —
    // so the seed has to change. It is a COUNTER and not Math.random(), for
    // two reasons. The React Compiler's purity rule refuses an impure call
    // anywhere in a component's scope, invocation timing notwithstanding. And
    // a random seed generated in a state initialiser would differ across
    // hydration, ordering the deck one way in the HTML and another the moment
    // React took over. A counter has neither problem and costs nothing: the
    // orders it walks are arbitrary with respect to the cards, which is all
    // "random" has to mean here.
    if (next === "random") setSeed((current) => current + 1);
    setSort(next);
    // Every card goes back to its front. Nothing FORCES this any more — flips
    // key on the id, so they would survive the re-sort perfectly well. It is a
    // choice: sorting is a request for a fresh pass through the deck, and
    // twenty answers left face up defeats the thing the reader just asked for.
    setFlippedIds(new Set<string>());
  }

  const ordered = orderFlashcards(cards, sort, seed);

  // Cards already stamped this mount. The old overlay was opened once per card;
  // a tile invites flipping back and forth, and each stamp is a role lookup
  // plus an update on the single pm2 fork process that also serves every SSE
  // stream. Re-stamping is harmless to the data — it writes the same kind of
  // value — so this is about the requests, not correctness.
  //
  // A ref and not state, because nothing renders from it: a re-render on the
  // first reveal of every card is precisely the reordering markFlashcardViewed
  // avoids by not revalidating.
  const stamped = useRef<Set<string>>(new Set());

  // Revealing a card's answer is the one place lastViewedAt is stamped. It used
  // to fire on OPENING a card, when the deck was an overlay; the equivalent act
  // is now the flip to the back, and only that direction. This is stricter and
  // more honest — the timestamp feeds the "À réviser" ordering, and seeing the
  // question is not revising.
  //
  // A HANDLER and not an effect, deliberately. An effect keyed on the flipped
  // set would re-fire whenever its dependencies changed identity, and
  // `onViewed` is a bound server action whose identity this component does not
  // control — so a stamp could fire on renders caused by something else
  // entirely. Revealing a card is a click; treat it as one.
  //
  // Fired without awaiting: a dropped stamp costs one card's ordering, and a
  // blocked flip costs the feature. The action itself refuses the teacher, so
  // the isTeacher check here only avoids a request that would do nothing.
  function toggleFlip(id: string) {
    const revealing = !flippedIds.has(id);
    setFlippedIds((current) => {
      const next = new Set(current);
      if (revealing) next.add(id);
      else next.delete(id);
      return next;
    });
    if (revealing && !isTeacher && !stamped.current.has(id)) {
      stamped.current.add(id);
      void onViewed(id);
    }
  }

  // The card is gone, so its id must not stay in the set. Nothing reads a
  // stale id today — the card never comes back — but a set that only ever
  // grows is the kind of thing a later feature reads and is wrong about.
  async function removeCard(id: string) {
    await onDelete(id);
    setFlippedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  const options: { sort: FlashcardSort; label: string }[] = [
    { sort: "added", label: t.sort.added },
    { sort: "random", label: t.sort.random },
    { sort: "revision", label: t.sort.revision },
  ];

  return (
    <div className="mx-auto max-w-[1152px]">
      {cards.length > 0 && (
        <div
          role="group"
          aria-label={t.sort.group}
          className="mb-5 flex flex-wrap justify-center gap-2"
        >
          {options.map((option) => (
            <FilterChip
              key={option.sort}
              tone="card"
              active={sort === option.sort}
              onClick={() => chooseSort(option.sort)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <p className={emptyStateText}>{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* `initial={false}` so the deck does not replay twenty entrances on
              every mount — a tab switch would otherwise animate cards nobody
              just added. Only a card that arrives while this list is on screen
              animates, which is exactly the one the reader wrote. */}
          <AnimatePresence initial={false}>
            {ordered.map((card) => (
            <motion.li
              key={card.id}
              layout={reduceMotion ? false : "position"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={motionTransition}
            >
              {/* The `layout` transform lives on this <li>; the flip's rotateY
                  lives on a motion.div two levels inside DeckCard. Parent and
                  child, not the same node, so the two do not fight. */}
              <DeckCard
                card={card}
                flipped={flippedIds.has(card.id)}
                locale={locale}
                onFlip={() => toggleFlip(card.id)}
                onDelete={() => removeCard(card.id)}
              />
            </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Its own row under the grid, centred, rather than a cell inside it: a
          + occupying a grid slot reads as a card, and it has to stay put when
          the deck is empty and there is no grid at all.

          `layout` is what makes it slide down when a new card adds a row
          instead of jumping there — framer measures the position change on
          the render after router.refresh() brings the longer deck back. */}
      <motion.button
        type="button"
        layout={reduceMotion ? false : "position"}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.4, 0.15, 0.2, 1] }}
        onClick={() => setAdding(true)}
        aria-label={t.addTitle}
        className={cn(
          "mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
          cardFocusRing,
        )}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </motion.button>

      {adding && (
        <AddSheet
          title={t.addTitle}
          closeLabel={strings.common.close}
          onClose={() => setAdding(false)}
        >
          <AddFlashcardForm
            locale={locale}
            onAdd={onAdd}
            onDone={() => {
              setAdding(false);
              // The deck is server-rendered, so a refresh is what makes the new
              // card appear rather than a local insert that could disagree with
              // it. No router.push: the FAB's version had to send the reader to
              // ?tab=deck, and this button is already on it.
              router.refresh();
            }}
          />
        </AddSheet>
      )}
    </div>
  );
}
