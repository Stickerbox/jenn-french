import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "rounded-full bg-[var(--color-accent)] px-6 py-3 font-[family-name:var(--font-body)] text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
