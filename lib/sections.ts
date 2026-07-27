// `id` exists only in the browser, to give React a stable key so a reordered
// section animates as a moving row rather than two rows swapping their text.
// It is optional and never persisted: normaliseSections and readSections both
// rebuild plain {title, body} objects, so it cannot reach the database and
// needs no migration.
export type CardSection = { title: string; body: string; id?: string };

// Deterministic by index rather than random, so the ids a server render
// produces match the ones hydration produces. Sections created later, by the
// teacher typing, are minted in the editor where only the client runs.
export function withIds(sections: CardSection[]): CardSection[] {
  return sections.map((section, index) => ({
    ...section,
    id: section.id ?? `s-${index}`,
  }));
}

export const PRONUNCIATION_TITLE = "Québec Pronunciation";

// Prisma types a Json column as JsonValue, which is to say it does not type it
// at all. Everything read from the database comes through here, so a
// hand-edited row or a half-finished migration produces a card with missing
// sections rather than a student page that throws.
export function readSections(value: unknown): CardSection[] {
  if (!Array.isArray(value)) return [];

  const sections: CardSection[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, body } = entry as Record<string, unknown>;
    if (typeof title !== "string" || typeof body !== "string") continue;
    sections.push({ title, body });
  }
  return sections;
}

// A section blank in both fields is the editor's trailing placeholder, or one
// the teacher started and abandoned. Neither should reach the database. A
// section with only a title is kept: she is writing the heading first.
export function normaliseSections(sections: CardSection[]): CardSection[] {
  return sections
    .map((section) => ({
      title: section.title.trim(),
      body: section.body.trim(),
    }))
    .filter((section) => section.title !== "" || section.body !== "");
}

export function moveSection(
  sections: CardSection[],
  index: number,
  direction: -1 | 1,
): CardSection[] {
  const target = index + direction;
  if (index < 0 || index >= sections.length) return sections;
  if (target < 0 || target >= sections.length) return sections;

  const next = [...sections];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Pronunciation is seeded empty rather than fixed: it is on every new card so
// the teacher never has to create it, but it is an ordinary section she can
// rename, move or delete on any given card.
export function seedSections(grammar: string, idiom: string): CardSection[] {
  return [
    { title: "Grammar", body: grammar },
    { title: PRONUNCIATION_TITLE, body: "" },
    { title: "Idiom of the day", body: idiom },
  ];
}

// The order here is the order these four fields render in today, so a card
// written before sections existed looks exactly as it did.
export function backfillSections(card: {
  examples: string | null;
  pronunciation: string | null;
  tip: string | null;
  idiom: string | null;
}): CardSection[] {
  const columns: [string, string | null][] = [
    ["Grammar", card.examples],
    [PRONUNCIATION_TITLE, card.pronunciation],
    ["Tip", card.tip],
    ["Idiom of the day", card.idiom],
  ];

  return columns
    .filter(([, body]) => body !== null && body.trim() !== "")
    .map(([title, body]) => ({ title, body: (body as string).trim() }));
}

// Drives the idiom box on the student card. Keyed to the shape of the text
// rather than the section's title, so the styling survives the teacher
// renaming or moving the section — and she can get it on any section.
const EXPRESSION_SHAPE = /^\s*\*\*[^*]+\*\*\s*[—–-]\s*\S/;

export function isExpressionBody(body: string): boolean {
  return EXPRESSION_SHAPE.test(body);
}
