"use client";

import { fieldClassName } from "@/components/ui/field";
import { cardFieldSkin } from "@/components/card-styles";
import { cn } from "@/lib/utils";

export function SearchField({
  label,
  value,
  onChange,
  // Was a hardcoded "Clear" — the one string H1 left behind because it is a
  // shared component, not a student- or admin-owned one. A prop rather than a
  // locale lookup: this is a client component, and every caller already has
  // strings in scope.
  clearLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clearLabel: string;
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
            cardFieldSkin,
            "mt-0 pr-20 [&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute inset-y-0 right-4 text-sm text-[var(--color-ink-muted)] underline"
          >
            {clearLabel}
          </button>
        )}
      </div>
    </div>
  );
}
