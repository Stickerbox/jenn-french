export function formatCardDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
