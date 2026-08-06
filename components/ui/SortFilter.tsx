"use client";

import { FilterChip, type ChipTone } from "@/components/ui/FilterChip";
import type { PageSort } from "@/lib/page-sort";

// The sibling of KindFilter, not a second visual language: same chip row,
// same tone prop, same shape of a `labels` object passed in rather than a
// locale switched on inside — the admin says "Created" and the student says
// "Créées", and a component that knows both is a component that has to be
// edited to add a third surface.
export function SortFilter({
  value,
  onChange,
  tone,
  labels,
}: {
  value: PageSort;
  onChange: (value: PageSort) => void;
  tone: ChipTone;
  labels: { group: string; created: string; modified: string };
}) {
  const options: { sort: PageSort; label: string }[] = [
    { sort: "created", label: labels.created },
    { sort: "modified", label: labels.modified },
  ];

  return (
    <div
      role="group"
      aria-label={labels.group}
      className="mb-5 flex flex-wrap justify-center gap-2"
    >
      {options.map((option) => (
        <FilterChip
          key={option.sort}
          tone={tone}
          active={value === option.sort}
          onClick={() => onChange(option.sort)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  );
}
