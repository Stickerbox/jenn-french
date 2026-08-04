"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { isSelectableCardDate } from "@/lib/card-dates";
import { MONTHS, formatWeekRange, weekDates, weekRange } from "@/lib/week";
import { cn } from "@/lib/utils";

// Full names so React has a distinct key per column — two of the five initials
// are "M".
const FRENCH_DAYS = [
  { letter: "L", label: "Lundi" },
  { letter: "M", label: "Mardi" },
  { letter: "M", label: "Mercredi" },
  { letter: "J", label: "Jeudi" },
  { letter: "V", label: "Vendredi" },
];

const utc = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

// Every date control on the card tab: the week-range line, the month calendar
// behind it, Aujourd'hui, and the five day dots.
//
// It replaces WeekDayPicker, which computed its five days from `today` and so
// could only ever show the week we are in, and it takes the range line over from
// CardHeading, which drew it from weekRange(today) and so could not have
// described another week even once one became reachable.
//
// All of the arithmetic here is getUTC*/Date.UTC and every rendered date comes
// from a string, so this renders identically on both sides of hydration.
// lib/chat-time.ts is the only module in this project that reads a local zone,
// and nothing here may follow it.
export function CardDateNav({
  slug,
  selected,
  today,
  latest,
  cardDates,
}: {
  slug: string;
  selected: string;
  // Real today, for the calendar's own "today" marker. Not a bound.
  today: string;
  // latestViewableDate(today), doing two jobs on purpose: it is where
  // Aujourd'hui goes AND the ceiling isSelectableCardDate compares against.
  // They are the same date because they are the same rule — the latest day a
  // student may look at — and two props would let one change without the other.
  latest: string;
  cardDates: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Duplicated from AdminDatePicker rather than shared, and MonthCalendar's own
  // comment says why: the trigger and the focus target are this component's,
  // and sharing them would need a render prop.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    // mousedown rather than click: a click that starts outside and ends on the
    // trigger would otherwise close and immediately reopen the popover.
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  function go(date: string) {
    router.push(`/g/${slug}?date=${date}`, { scroll: false });
  }

  function choose(date: string) {
    setOpen(false);
    triggerRef.current?.focus();
    go(date);
  }

  const selectedDate = utc(selected);
  const { start, end } = weekRange(selectedDate);
  const days = weekDates(selectedDate);

  const cards = new Set(cardDates);
  const selectable = (date: string) =>
    isSelectableCardDate(date, { cardDates: cards, latest });

  return (
    <div ref={rootRef} className="relative mx-auto mb-8 max-w-[560px]">
      <div className="flex flex-col items-center gap-1.5">
        {/* The week range is the calendar's trigger now, rather than a static
            line above a strip that could not leave this week. */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-full px-3 py-1 font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c] transition-colors hover:bg-[var(--card-bleu-soft)] hover:text-[var(--card-bleu)]"
        >
          {formatWeekRange(start, end)} ⌄
        </button>

        {/* Disabled rather than hidden when they are already there, the pattern
            PageList's pin button uses for a control that is present but
            inapplicable — a control that vanishes is one they have to
            rediscover. */}
        <button
          type="button"
          onClick={() => go(latest)}
          disabled={selected === latest}
          className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline transition-opacity disabled:opacity-40 disabled:no-underline"
        >
          Aujourd&apos;hui
        </button>
      </div>

      {open && (
        <MonthCalendar
          selected={selected}
          today={today}
          locale="fr-CA"
          tone="card"
          labels={{
            dialog: "Choisir une date",
            previousMonth: "Mois précédent",
            nextMonth: "Mois suivant",
            // English and uppercase, matching the trigger directly above it,
            // which has always read "JULY 27 → JULY 31, 2026" under a French
            // eyebrow. French month names here would make the panel disagree
            // with the line that opens it; localising every date on the card
            // page is a separate change.
            monthNames: MONTHS,
            weekdays: FRENCH_DAYS.map((day) => day.label),
          }}
          isEnabled={selectable}
          onChoose={choose}
          className="left-1/2 -translate-x-1/2"
        />
      )}

      <div className="mt-4 flex justify-center gap-2">
        {days.map((date, index) => {
          const dateStr = iso(date);
          const isSelected = dateStr === selected;
          const enabled = selectable(dateStr);
          const { letter, label } = FRENCH_DAYS[index];

          return (
            <button
              key={dateStr}
              type="button"
              aria-label={label}
              title={label}
              // A day with nothing posted is not a destination. Before this the
              // dot was always live and led to "Nothing posted yet".
              disabled={!enabled}
              onClick={() => go(dateStr)}
              className={cn(
                "flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] font-[family-name:var(--card-font-mono)] text-xs font-bold transition-all",
                // isSelected FIRST, so a selected day with no card still draws
                // as selected. Reachable via Aujourd'hui on a weekday Jenn
                // skipped, and via a hand-typed ?date=.
                isSelected
                  ? "scale-[1.12] border-[var(--card-bleu)] bg-[var(--card-bleu)] text-white"
                  : enabled
                    ? "border-[var(--card-line)] bg-[var(--card-paper)] text-[#9c8f75] hover:border-[var(--card-bleu)] hover:text-[var(--card-bleu)]"
                    : "border-[var(--card-line)] bg-transparent text-[#c9bfae]",
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>
    </div>
  );
}
