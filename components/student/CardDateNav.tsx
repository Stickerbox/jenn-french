"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
import { isSelectableCardDate } from "@/lib/card-dates";
import {
  formatWeekRange,
  monthNamesFor,
  weekDates,
  weekdayNamesFor,
  weekRange,
} from "@/lib/week";
import { toBCP47, type Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

const utc = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

// Decorative only — the trigger's own text plus aria-haspopup/aria-expanded
// carry the meaning a screen reader needs, so both glyphs are aria-hidden.
function CalendarGlyphIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

// Rotates with `open` rather than swapping glyphs, so the state change is a
// transform the browser animates for free instead of a layout swap.
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        "transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-180",
      )}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
  locale,
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
  // This is a client component, so it cannot call headers() itself — the
  // server component above it (app/g/[slug]/page.tsx) reads the locale once
  // and hands it down, and getStrings(locale) below rebuilds the dictionary
  // here rather than taking it as a prop — see lib/strings.ts on why a
  // resolved `Strings` object cannot cross the boundary a prop like that would
  // cross.
  locale: Locale;
}) {
  const strings = getStrings(locale);
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

  // Full weekday names, Monday to Friday, from the locale-driven table in
  // lib/week.ts. The initial React needs as a distinct key per column is
  // derived from the first character rather than stored — see weekdayNamesFor's
  // own comment on why a stored "letter" would be one more table to keep in
  // step across two languages that collide on different pairs of days.
  const weekdayLabels = weekdayNamesFor(locale);

  return (
    <div
      ref={rootRef}
      // mb-[var(--space-5)] rather than mb-8: same 32px, but named as the
      // page's own rhythm unit — see app/g/[slug]/page.tsx, which uses the
      // same token for the header and the tab strip below it, so the three
      // gaps between the page's major zones read as one decision rather than
      // three numbers that happen to agree.
      className="relative mx-auto mb-[var(--space-5)] max-w-[560px]"
    >
      <div className="flex flex-col items-center gap-1.5">
        {/* The week range is the calendar's trigger now, rather than a static
            line above a strip that could not leave this week — so it is drawn
            as a real button (pill, border, icons) rather than the uppercase
            mono eyebrow it used to be, which read as a caption. */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] transition-colors duration-150 motion-reduce:transition-none",
            "border-[var(--card-line)] bg-[var(--card-paper)] text-[#8a7f6c] shadow-sm",
            "hover:border-[var(--card-bleu)] hover:bg-[var(--card-bleu-soft)] hover:text-[var(--card-bleu)]",
            "active:bg-[var(--card-bleu-soft)] active:text-[var(--card-bleu)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--card-bleu)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-paper-back)]",
            // Reads as pressed while the popover is open, the same state a
            // toggle control shows — otherwise the trigger looks identical
            // whether or not the thing it opens is on screen.
            open && "border-[var(--card-bleu)] bg-[var(--card-bleu-soft)] text-[var(--card-bleu)]",
          )}
        >
          <CalendarGlyphIcon />
          <span>{formatWeekRange(start, end, locale)}</span>
          <ChevronIcon open={open} />
        </button>

        {/* Disabled rather than hidden when they are already there, the pattern
            PageList's pin button uses for a control that is present but
            inapplicable — a control that vanishes is one they have to
            rediscover.

            inline-flex + min-h-[44px] rather than a bigger font or visible
            padding: the touch target grows, the word "Aujourd'hui" does not —
            padding alone would have pushed the underline away from the text
            it sits under. */}
        <button
          type="button"
          onClick={() => go(latest)}
          disabled={selected === latest}
          className={cn(
            "inline-flex min-h-[44px] items-center rounded-md px-1 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline transition-opacity duration-150 motion-reduce:transition-none disabled:opacity-40 disabled:no-underline",
            cardFocusRing,
          )}
        >
          {strings.common.today}
        </button>
      </div>

      {open && (
        <MonthCalendar
          selected={selected}
          today={today}
          locale={toBCP47(locale)}
          tone="card"
          labels={{
            dialog: strings.student.dateNav.dialogLabel,
            previousMonth: strings.student.dateNav.previousMonth,
            nextMonth: strings.student.dateNav.nextMonth,
            // Now follows the same locale as the trigger above it, which used
            // to read "JULY 27 → JULY 31, 2026" under a French eyebrow — the
            // English month names existed only to match that line, and both
            // now come from the same place, so there is nothing left for them
            // to disagree about.
            monthNames: monthNamesFor(locale),
            weekdays: weekdayLabels,
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
          const label = weekdayLabels[index];
          const letter = label[0];

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
                // The dot stays 32px — a 44px circle here would visibly
                // outgrow the word "dot", and five of them plus four gaps
                // would widen the row from 202px to 252px for no visual gain.
                // `before:-inset-1.5` is the "grow the hit box, not the look"
                // move the task asks for instead: an invisible pseudo-element
                // 6px past the circle on every side, landing the real target
                // at 44px without moving a pixel anyone can see. Two adjacent
                // dots' invisible zones do meet in the middle of their 8px
                // gap — a ~4px band where either button could catch the tap —
                // which is the one accepted imprecision this trade makes.
                "relative flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] font-[family-name:var(--card-font-mono)] text-xs font-bold transition-all duration-150 before:absolute before:-inset-1.5 before:content-[''] motion-reduce:transition-none",
                cardFocusRing,
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
