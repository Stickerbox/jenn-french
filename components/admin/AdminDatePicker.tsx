"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";

export function AdminDatePicker({
  basePath,
  selected,
}: {
  basePath: string;
  selected: string;
}) {
  const router = useRouter();

  return (
    <label className="mx-auto mb-6 block w-full max-w-[560px] text-sm font-medium text-[var(--color-ink)]">
      Date
      <Input
        type="date"
        // Capped rather than full-width: a date field needs about 200px, and
        // stretching it the whole width of the card made it the widest thing
        // on the page on a phone.
        className="max-w-[220px]"
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          // Clearing a date input fires onChange with "". Navigating on that
          // would drop ?date= entirely and bounce the teacher back to today
          // mid-edit, so treat it as no change at all.
          if (!next) return;
          router.push(`${basePath}?date=${next}`, { scroll: false });
        }}
      />
    </label>
  );
}
