import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "mt-1 block w-full rounded-lg border border-[var(--color-ink-muted)]/30 bg-white px-3 py-2 font-[var(--font-body)] text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
