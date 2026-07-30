export function formatCardDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The pages list wants a full date ("30 juillet 2026"), not the compact
// weekday form the flashcard header uses.
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
