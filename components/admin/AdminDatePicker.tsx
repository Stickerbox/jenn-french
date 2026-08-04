"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonthCalendar } from "@/components/ui/MonthCalendar";
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

  function choose(date: string) {
    setOpen(false);
    // The day button just clicked unmounts with the popover, which would
    // otherwise drop focus to <body> mid-keyboard-workflow. Match the
    // Escape path, which already restores it to the trigger.
    triggerRef.current?.focus();
    router.push(`${basePath}?date=${date}`, { scroll: false });
  }

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
        onClick={() => setOpen(!open)}
        // Capped rather than full-width: a date field needs about 260px, and
        // stretching it the whole width of the card made it the widest thing
        // on the page on a phone.
        className={cn(
          fieldClassName,
          "max-w-[260px] whitespace-nowrap text-left",
        )}
      >
        {formatFull(selected)}
      </button>

      {open && (
        // No isEnabled: every teaching day stays selectable here. Pre-posting
        // ahead is Jenn's workflow, and a bound would make those days
        // unreachable from /admin — the same reason parseAdminDate does not
        // clamp future dates the way the student page's parseDate does.
        <MonthCalendar
          selected={selected}
          today={today}
          locale="en-CA"
          tone="admin"
          labels={{
            dialog: "Choose a date",
            previousMonth: "Previous month",
            nextMonth: "Next month",
            monthNames: MONTHS,
            weekdays: WEEKDAYS,
          }}
          onChoose={choose}
          className="left-0"
        />
      )}
    </div>
  );
}
