export type CardContent = {
  date: Date;
  subject: string | null;
  usage: string | null;
  pronunciation: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  examples: string;
  tip: string | null;
  idiom: string | null;
};

export function pickEffectiveCard(
  override: CardContent | null,
  fallback: CardContent | null,
): CardContent | null {
  if (!override) return fallback;
  if (!fallback) return override;
  return override.date.getTime() >= fallback.date.getTime()
    ? override
    : fallback;
}

export function mergeArchiveDates(
  overrideDates: Date[],
  globalDates: Date[],
): Date[] {
  const unique = new Map<string, Date>();
  for (const date of [...overrideDates, ...globalDates]) {
    unique.set(date.toISOString().slice(0, 10), date);
  }
  return [...unique.values()].sort((a, b) => b.getTime() - a.getTime());
}
