import { toBCP47, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

// Defaulted rather than required: the admin (components/admin/**) and the
// worksheet chooser (components/worksheet/**) call these too and are not part
// of this task's scope — Task H2 converts the admin. Defaulting to
// DEFAULT_LOCALE keeps every one of those call sites compiling and rendering
// exactly as it did before, in French, with no edit forced on a file this
// task does not own.
export function formatCardDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return date.toLocaleDateString(toBCP47(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The pages list wants a full date ("30 juillet 2026"), not the compact
// weekday form the flashcard header uses.
export function formatLongDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return date.toLocaleDateString(toBCP47(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
