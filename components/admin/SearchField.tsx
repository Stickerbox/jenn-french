"use client";

import { fieldClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-5">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={label}
          aria-label={label}
          // WebKit draws its own clear button inside a type="search" input,
          // which would sit under ours. The semantics are worth keeping; the
          // second X is not.
          className={cn(
            fieldClassName,
            "mt-0 pr-20 [&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute inset-y-0 right-4 text-sm text-[var(--color-ink-muted)] underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
