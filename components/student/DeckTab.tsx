"use client";

import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
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
  onDelete,
  onViewed,
}: {
  cards: FlashcardRow[];
  isTeacher: boolean;
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onDelete: (id: string) => Promise<void>;
  // The bound markFlashcardViewed. Returns a promise this component
  // deliberately does not await.
  onViewed: (id: string) => Promise<void>;
}) {
  const t = getStrings(locale).student.deck;
  const [sort, setSort] = useState<FlashcardSort>("added");
  const [seed, setSeed] = useState(1);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
          {ordered.map((card, index) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => show(index)}
                aria-label={t.open(card.front)}
                className={cn(
                  "flex min-h-[132px] w-full flex-col justify-between rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper)] p-4 text-left shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
                  cardFocusRing,
                )}
              >
                <span className={cardDateLabel}>
                  {formatLongDate(card.createdAt, locale)}
                </span>
                {/* The front only. A tile that showed the answer would make the
                    deck a glossary and the revision order meaningless. */}
                <span className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]">
                  {card.front}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
