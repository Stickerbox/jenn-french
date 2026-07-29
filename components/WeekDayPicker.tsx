"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const FRENCH_DAYS = [
  { letter: "L", label: "Lundi" },
  { letter: "M", label: "Mardi" },
  { letter: "M", label: "Mercredi" },
  { letter: "J", label: "Jeudi" },
  { letter: "V", label: "Vendredi" },
];

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentWeekDates(today: Date): Date[] {
  const dayOfWeek = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);

  return FRENCH_DAYS.map((_, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });
}

export function WeekDayPicker({
  slug,
  today,
  selected,
}: {
  slug: string;
  today: Date;
  selected: string;
}) {
  const router = useRouter();
  const weekDates = currentWeekDates(today);

  return (
    <div className="mx-auto mb-8 flex max-w-[560px] justify-center gap-2">
      {weekDates.map((date, index) => {
        const dateStr = toDateStr(date);
        const isSelected = dateStr === selected;
        const { letter, label } = FRENCH_DAYS[index];

        return (
          <button
            key={dateStr}
            aria-label={label}
            title={label}
            onClick={() =>
              router.push(`/g/${slug}?date=${dateStr}`, { scroll: false })
            }
            className={cn(
              "flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.5px] font-[family-name:var(--card-font-mono)] text-xs font-bold transition-all",
              isSelected
                ? "scale-[1.12] border-[var(--card-bleu)] bg-[var(--card-bleu)] text-white"
                : "border-[var(--card-line)] bg-[var(--card-paper)] text-[#9c8f75] hover:border-[var(--card-bleu)] hover:text-[var(--card-bleu)]",
            )}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
