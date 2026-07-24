"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ArchiveList({
  slug,
  dates,
  today,
  selected,
}: {
  slug: string;
  dates: string[];
  today: string;
  selected: string;
}) {
  const router = useRouter();

  if (dates.length === 0) return null;

  return (
    <div className="mx-auto mt-10 flex max-w-md flex-wrap justify-center gap-2">
      {dates.map((date) => (
        <button
          key={date}
          onClick={() =>
            router.push(`/g/${slug}?date=${date}`, { scroll: false })
          }
          className={cn(
            "rounded-full px-3 py-1 font-[var(--font-body)] text-xs transition-colors",
            date === selected
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:opacity-80",
            date === today &&
              date !== selected &&
              "ring-1 ring-[var(--color-accent)]",
          )}
        >
          {date}
          {date === today ? " (today)" : ""}
        </button>
      ))}
    </div>
  );
}
