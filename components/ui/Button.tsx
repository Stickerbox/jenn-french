import { cn } from "@/lib/utils";
import { accentFocusRing } from "@/components/ui/field";
import type { ButtonHTMLAttributes } from "react";

// Renders on /login as well as inside the admin forms this task touches
// (CardEditor, NewGroupForm, AddLinkForm, NewPageForm, PageEditor) — a shared
// primitive, so the focus ring and touch target added here reach that page
// too. Both are additive (a ring that was not drawn before, a hit box that
// was already close to 44px and is now exactly at it) rather than a visual
// change to anything /login already showed.
export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "min-h-[44px] rounded-full bg-[var(--color-accent)] px-6 py-3 font-[family-name:var(--font-body)] text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none disabled:opacity-50",
        accentFocusRing,
        className,
      )}
      {...props}
    />
  );
}
