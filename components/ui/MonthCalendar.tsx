"use client";

import { useState } from "react";
import { monthWeekdayRows } from "@/lib/month-grid";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";
import { accentFocusRing } from "@/components/ui/field";

export type CalendarTone = "admin" | "card";

export type CalendarLabels = {
  dialog: string;
  previousMonth: string;
  nextMonth: string;
  monthNames: readonly string[];
  // Full names, not initials: two of the five are "M" in both English and
  // French, and React needs a distinct key per column. The grid renders the
  // first letter of each.
  weekdays: readonly string[];
};

const utc = (value: string) => new Date(`${value}T00:00:00Z`);

// Two palettes rather than one with overrides. The admin's --color-* tokens and
// the flashcard template's --card-* tokens are separate systems (see the styling
// note in CLAUDE.md), and a shared class string with three exceptions threaded
// through it is how they get mixed up.
const TONES = {
  admin: {
    panel: "border-[var(--color-field-border)] bg-[var(--color-field)]",
    step: "text-[var(--color-ink-muted)] hover:bg-[var(--color-bg)]",
    month: "font-[family-name:var(--font-body)] text-[var(--color-ink)]",
    weekday:
      "font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]",
    day: "font-[family-name:var(--font-body)]",
    selected: "bg-[var(--color-accent)] font-semibold text-white",
    idle: "text-[var(--color-ink)] hover:bg-[var(--color-bg)]",
    today: "font-bold text-[var(--color-accent)]",
    ring: accentFocusRing,
  },
  card: {
    panel: "border-[var(--card-line)] bg-[var(--card-paper)]",
    step: "text-[var(--card-moss)] hover:bg-[var(--card-bleu-soft)]",
    month: "font-[family-name:var(--card-font-mono)] text-[var(--card-ink)]",
    weekday: "font-[family-name:var(--card-font-mono)] text-[var(--card-moss)]",
    day: "font-[family-name:var(--card-font-mono)]",
    selected: "bg-[var(--card-bleu)] font-semibold text-white",
    idle: "text-[var(--card-ink)] hover:bg-[var(--card-bleu-soft)]",
    today: "font-bold text-[var(--card-bleu)]",
    ring: cardFocusRing,
  },
} as const;

// The month grid inside a date popover: a stepper, five weekday columns, and a
// button per teaching day. Extracted from AdminDatePicker so the student's card
// page uses the same calendar rather than a second one that drifts from it.
//
// It does NOT own the popover's open state, its trigger, or dismissal. Each
// caller keeps those, deliberately: the two triggers are a labelled admin field
// and a French week-range line, and each restores focus to its own ref on
// Escape and on choose. Sharing that would mean handing the ref back out through
// a render prop, which is more machinery than the twenty lines it saves.
//
// Position comes in through `className`, for the reason Fab's comment gives.
export function MonthCalendar({
  selected,
  today,
  locale,
  tone,
  labels,
  isEnabled,
  onChoose,
  className,
}: {
  selected: string;
  today: string;
  // aria-labels only. Nothing VISIBLE here is locale-formatted — the month
  // header comes from labels.monthNames — so this cannot cause the hydration
  // mismatch a toLocaleDateString in rendered text would.
  locale: string;
  tone: CalendarTone;
  labels: CalendarLabels;
  // Undefined means every teaching day is selectable, which is the ADMIN's
  // rule: pre-posting ahead is Jenn's workflow and clamping would make those
  // days unreachable from /admin. The student page passes a predicate.
  isEnabled?: (date: string) => boolean;
  onChoose: (date: string) => void;
  className?: string;
}) {
  // Seeded from `selected` on mount, and that is the whole of keeping it in
  // step. Both callers render this as {open && <MonthCalendar />}, so mounting
  // IS the seeding — which is why AdminDatePicker's old re-seed inside toggle()
  // is gone rather than moved here. It existed only because the panel never
  // unmounted.
  const [cursor, setCursor] = useState(() => ({
    year: utc(selected).getUTCFullYear(),
    month: utc(selected).getUTCMonth(),
  }));

  const palette = TONES[tone];
  const rows = monthWeekdayRows(cursor.year, cursor.month);

  function stepMonth(delta: number) {
    const stepped = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({
      year: stepped.getUTCFullYear(),
      month: stepped.getUTCMonth(),
    });
  }

  function formatFull(value: string): string {
    return utc(value).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return (
    <div
      role="dialog"
      aria-label={labels.dialog}
      className={cn(
        // panel-pop, the keyframe AddMenu and AddSheet's desktop form already
        // use. A popover that is simply there on the frame after a press reads
        // as a repaint rather than as something opening.
        "absolute z-20 mt-2 w-[300px] max-w-[calc(100vw-2rem)] animate-[panel-pop_180ms_ease-out] rounded-xl border p-3 shadow-lg motion-reduce:animate-none",
        palette.panel,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={labels.previousMonth}
          onClick={() => stepMonth(-1)}
          className={cn(
            "flex h-9 min-w-9 items-center justify-center rounded-full px-3 py-1 transition-colors duration-150 motion-reduce:transition-none",
            palette.step,
            palette.ring,
          )}
        >
          ‹
        </button>
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-[2px]",
            palette.month,
          )}
        >
          {labels.monthNames[cursor.month]} {cursor.year}
        </span>
        <button
          type="button"
          aria-label={labels.nextMonth}
          onClick={() => stepMonth(1)}
          className={cn(
            "flex h-9 min-w-9 items-center justify-center rounded-full px-3 py-1 transition-colors duration-150 motion-reduce:transition-none",
            palette.step,
            palette.ring,
          )}
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {labels.weekdays.map((name) => (
          <div
            key={name}
            aria-hidden
            className={cn(
              "py-1 text-center text-[11px] font-semibold uppercase",
              palette.weekday,
            )}
          >
            {name[0]}
          </div>
        ))}

        {rows.flat().map((cell) => {
          const isSelected = cell.date === selected;
          const isToday = cell.date === today;
          const enabled = isEnabled ? isEnabled(cell.date) : true;

          return (
            <button
              key={cell.date}
              type="button"
              aria-label={formatFull(cell.date)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              // A day with no card is dead rather than absent from the grid: a
              // calendar missing a Tuesday reads as a rendering fault.
              disabled={!enabled}
              onClick={() => onChoose(cell.date)}
              // Not grown to 44px, unlike this task's other touch targets: a
              // five-across grid of them already spans the popover's width,
              // and a dense date grid is the one interactive pattern where
              // WCAG's own guidance (2.5.5) accepts a smaller target because
              // the control's neighbours are its equivalent alternatives —
              // tapping the wrong day is a one-tap correction, not a dead end.
              className={cn(
                "rounded-lg py-1.5 text-center text-sm transition-colors duration-150 motion-reduce:transition-none",
                palette.day,
                palette.ring,
                // isSelected FIRST, so a selected day with no card still draws
                // as selected. The student page reaches that state two ways:
                // Aujourd'hui on a day Jenn skipped, and a hand-typed ?date=.
                isSelected ? palette.selected : enabled ? palette.idle : "",
                !isSelected && !enabled && "opacity-30",
                !isSelected && enabled && isToday && palette.today,
                !cell.inMonth && "opacity-40",
              )}
            >
              {Number(cell.date.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
