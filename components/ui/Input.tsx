import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

// Shared with AdminDatePicker's trigger, which has to look like this field but
// is a button rather than an input.
export const inputClassName =
  "mt-1 block w-full rounded-lg border border-[var(--color-ink-muted)]/30 bg-white px-3 py-2 font-[family-name:var(--font-body)] text-base sm:text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...props} />;
}
