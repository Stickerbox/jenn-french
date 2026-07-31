"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { monthWeekdayRows } from "@/lib/month-grid";
import { MONTHS } from "@/lib/week";
import { fieldClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// Full names so React has a distinct key per column — two of the five initials
// are "M".
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

const utc = (value: string) => new Date(`${value}T00:00:00Z`);

function formatFull(value: string): string {
  return utc(value).toLocaleDateString("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AdminDatePicker({
  basePath,
  selected,
  today,
}: {
  basePath: string;
  selected: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Which month the grid is showing. Seeded when the popover opens rather than
  // held in sync with `selected`, so opening always lands on the selected day's
  // month however far the teacher paged away last time.
  const [cursor, setCursor] = useState(() => ({
    year: utc(selected).getUTCFullYear(),
    month: utc(selected).getUTCMonth(),
  }));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  function toggle() {
    if (!open) {
      setCursor({
        year: utc(selected).getUTCFullYear(),
        month: utc(selected).getUTCMonth(),
      });
    }
    setOpen(!open);
  }

  function stepMonth(delta: number) {
    const stepped = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({
      year: stepped.getUTCFullYear(),
      month: stepped.getUTCMonth(),
    });
  }

  function choose(date: string) {
    setOpen(false);
    // The day button just clicked unmounts with the popover, which would
    // otherwise drop focus to <body> mid-keyboard-workflow. Match the
    // Escape path, which already restores it to the trigger.
    triggerRef.current?.focus();
    router.push(`${basePath}?date=${date}`, { scroll: false });
  }

  const rows = monthWeekdayRows(cursor.year, cursor.month);

  return (
    // No bottom margin: both places this renders are gap-6 flex columns
    // inside CardEditor, which space it already.
    <div ref={rootRef} className="relative mx-auto w-full max-w-[560px]">
      <span
        id="admin-date-label"
        className="block text-sm font-medium text-[var(--color-ink)]"
      >
        Date
      </span>
      <button
        ref={triggerRef}
        id="admin-date-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        // aria-labelledby replaces the accessible name outright, so both ids
        // are listed — the label for "Date" and the button itself for the
        // formatted date text.
        aria-labelledby="admin-date-label admin-date-trigger"
        onClick={toggle}
        // Capped rather than full-width: a date field needs about 260px, and
        // stretching it the whole width of the card made it the widest thing
        // on the page on a phone.
        className={cn(fieldClassName, "max-w-[260px] whitespace-nowrap text-left")}
      >
        {formatFull(selected)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 z-20 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] p-3 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => stepMonth(-1)}
              className="rounded-full px-3 py-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-bg)]"
            >
              ‹
            </button>
            <span className="font-[family-name:var(--font-body)] text-xs font-semibold uppercase tracking-[2px] text-[var(--color-ink)]">
              {MONTHS[cursor.month]} {cursor.year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => stepMonth(1)}
              className="rounded-full px-3 py-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-bg)]"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1">
            {WEEKDAYS.map((name) => (
              <div
                key={name}
                aria-hidden
                className="py-1 text-center font-[family-name:var(--font-body)] text-[11px] font-semibold uppercase text-[var(--color-ink-muted)]"
              >
                {name[0]}
              </div>
            ))}

            {rows.flat().map((cell) => {
              const isSelected = cell.date === selected;
              const isToday = cell.date === today;

              return (
                <button
                  key={cell.date}
                  type="button"
                  aria-label={formatFull(cell.date)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => choose(cell.date)}
                  className={cn(
                    "rounded-lg py-1.5 text-center font-[family-name:var(--font-body)] text-sm transition-colors",
                    isSelected
                      ? "bg-[var(--color-accent)] font-semibold text-white"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-bg)]",
                    !isSelected && isToday && "font-bold text-[var(--color-accent)]",
                    !cell.inMonth && "opacity-40",
                  )}
                >
                  {Number(cell.date.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
