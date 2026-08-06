// Shared by Input, Textarea, and AdminDatePicker's trigger — which has to look
// like a field but is a button, so it cannot just render <Input>.
export const fieldClassName =
  "mt-1 block w-full rounded-xl border border-[var(--color-field-border)] bg-[var(--color-field)] px-4 py-3 font-[family-name:var(--font-body)] text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/60 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20";

// Wave 5, Task J's focus ring for the --color-* half of the app — the accent
// palette's counterpart to card-styles.ts's `cardFocusRing`, kept here rather
// than there because that file is documented as flashcard-template-only.
// Several controls in this half (Button, Fab, AddMenu/AddSheet's dismiss
// controls, the chat panel's close and back buttons) showed no focus state
// beyond the browser default, or none at all where a parent had already set
// `outline-none`. `--color-bg` is the offset colour on every caller
// regardless of the exact panel behind it (--color-bg, --color-field,
// --color-accent-soft), for the same reason cardFocusRing standardises on
// one card surface — the differences are too close to read as a mismatch.
export const accentFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";
