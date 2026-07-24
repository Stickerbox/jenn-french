export function WordTag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-[var(--color-accent-soft)] px-3 py-1 font-[var(--font-body)] text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
      {label}
    </span>
  );
}
