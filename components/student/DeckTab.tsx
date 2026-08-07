"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FilterChip } from "@/components/ui/FilterChip";
import { AddSheet } from "@/components/ui/AddSheet";
import { AddFlashcardForm } from "@/components/student/AddFlashcardForm";
import { FlashcardViewer } from "@/components/student/FlashcardViewer";
import { orderFlashcards, type FlashcardSort } from "@/lib/flashcard-order";
import { cardDateLabel, cardFocusRing, emptyStateText } from "@/components/card-styles";
import { formatLongDate } from "@/lib/format";
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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
    // The open card's index refers to the OLD order. Closing is honest;
    // silently showing a different card is not.
    setOpenIndex(null);
  }

  const ordered = orderFlashcards(cards, sort, seed);

  // Making a card current — from the grid or from the viewer's arrows — is the
  // one place lastViewedAt is stamped.
  //
  // A HANDLER and not an effect, deliberately. An effect keyed on the current
  // card would re-fire whenever its dependencies changed identity, and
  // `onViewed` is a bound server action whose identity this component does not
  // control — so a stamp could fire on renders caused by something else
  // entirely. Opening a card is a click; treat it as one.
  //
  // Fired without awaiting: a dropped stamp costs one card's ordering, and a
  // blocked open costs the feature. The action itself refuses the teacher, so
  // the isTeacher check here only avoids a request that would do nothing.
  function show(index: number) {
    setOpenIndex(index);
    const card = ordered[index];
    if (card && !isTeacher) void onViewed(card.id);
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
            {ordered.map((card, index) => (
            <motion.li
              key={card.id}
              layout={reduceMotion ? false : "position"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={motionTransition}
            >
              <button
                type="button"
                onClick={() => show(index)}
                aria-label={t.open(card.front)}
                className={cn(
                  // 160px rather than the old 132px: the word below is centred
                  // in whatever this leaves under the date, and at 132px there
                  // was not enough of it left for the centring to read as one.
                  "flex min-h-[160px] w-full flex-col rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-4 text-left shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
                  cardFocusRing,
                )}
              >
                <span className={cardDateLabel}>
                  {formatLongDate(card.createdAt, locale)}
                </span>
                {/* The front only. A tile that showed the answer would make the
                    deck a glossary and the revision order meaningless.

                    It fills what the date leaves and centres on both axes, so
                    the word is the tile rather than a caption under a date.
                    `break-words` because this is now text-2xl inside a tile as
                    narrow as ~140px on a two-column phone grid, and a long
                    French infinitive would otherwise run out of it. */}
                <span className="flex flex-1 items-center justify-center break-words text-center font-[family-name:var(--card-font-serif)] text-2xl font-bold text-[var(--card-ink)]">
                  {card.front}
                </span>
              </button>
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

      {openIndex !== null && (
        <FlashcardViewer
          cards={ordered}
          index={openIndex}
          locale={locale}
          // `show`, not setOpenIndex: paging with the arrows makes a new card
          // current, and that is a view.
          onIndex={show}
          onClose={() => setOpenIndex(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
