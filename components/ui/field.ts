// Shared by Input, Textarea, and AdminDatePicker's trigger — which has to look
// like a field but is a button, so it cannot just render <Input>.
export const fieldClassName =
  "mt-1 block w-full rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-4 py-3 font-[family-name:var(--font-body)] text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20";
