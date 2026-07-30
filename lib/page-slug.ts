const MAX_SLUG_LENGTH = 60;

// A page's slug is derived from its title once, when the page is created.
// Renaming a page deliberately does not move it: students bookmark these
// links, and fixing a typo in a title must not break a link already handed out.
export function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    // Decomposed accents are their own code points after NFD, so dropping the
    // combining-marks block turns "é" into "e" instead of losing the letter.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // NFD does not decompose ligatures, so without this the letter is dropped
    // rather than simplified: "cœur" would become "c-ur" instead of "coeur".
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");

  return slug || "page";
}

export function uniqueSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
