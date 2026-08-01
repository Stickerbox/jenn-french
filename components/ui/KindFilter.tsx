"use client";

import { FilterChip, type ChipTone } from "@/components/ui/FilterChip";
import type { KindFilter as Kind } from "@/lib/page-filters";

// Labels are passed in rather than switched on a locale flag: the admin says
// "Pages" and the student says "Les pages", and a component that knows both is
// a component that has to be edited to add a third.
export function KindFilter({
  value,
  onChange,
  tone,
  labels,
}: {
  value: Kind;
  onChange: (value: Kind) => void;
  tone: ChipTone;
  labels: { group: string; all: string; html: string; link: string };
}) {
  const options: { kind: Kind; label: string }[] = [
    { kind: "all", label: labels.all },
    { kind: "html", label: labels.html },
    { kind: "link", label: labels.link },
  ];

  return (
    <div
      role="group"
      aria-label={labels.group}
      className="mb-5 flex flex-wrap justify-center gap-2"
    >
      {options.map((option) => (
        <FilterChip
          key={option.kind}
          tone={tone}
          active={value === option.kind}
          onClick={() => onChange(option.kind)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  );
}
