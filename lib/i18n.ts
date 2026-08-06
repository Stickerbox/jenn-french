// The pure half of language selection: parsing an Accept-Language header into
// one of the two locales this site knows. No request, no headers() call and
// nothing impure in scope — that split is what lets this file be unit tested
// with plain strings instead of a mocked request. See lib/locale.ts for the
// half that actually reads one.

export type Locale = "fr" | "en";

// French, because this is a French tutor's site: an unknown visitor — a
// missing, empty or unparseable header — gets the language the content is in
// rather than a guess.
export const DEFAULT_LOCALE: Locale = "fr";

type RankedEntry = { lang: string; q: number };

// A q-value that is not a number in [0, 1] is not a preference, it is noise.
// It is important this returns null rather than a default of 1: the RFC's own
// implicit default for a MISSING q is 1, but a PRESENT, unparseable one
// ("q=banana") is a different case, and treating it as full strength would
// silently hand English a win the header never actually asked for.
function parseQ(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

// Splits "en-CA,en;q=0.9" into ranked entries, lower-cased, dropping any entry
// whose q-value failed to parse rather than assigning it a default — see
// parseQ. Entries with no q at all keep the RFC default of 1.
function parseAcceptLanguage(header: string): RankedEntry[] {
  const entries: RankedEntry[] = [];

  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const [langRaw, ...params] = trimmed.split(";").map((piece) => piece.trim());
    const lang = langRaw.toLowerCase();
    if (!lang) continue;

    let q = 1;
    let malformed = false;
    for (const param of params) {
      const match = /^q=(.+)$/.exec(param);
      if (!match) continue; // an unrelated parameter, not a q — ignored
      const parsed = parseQ(match[1]);
      if (parsed === null) {
        malformed = true;
        break;
      }
      q = parsed;
    }
    if (malformed) continue; // the whole entry is discarded, not defaulted

    entries.push({ lang, q });
  }

  return entries;
}

// The best q among entries naming `language` — "en" matches "en", "en-CA",
// "en-US", and so on — or null when the header names it nowhere. A bare "*"
// matches neither "en" nor "fr": it is a wildcard for "anything", not a vote
// for English, so on its own it falls through to the French default exactly
// as an empty header would.
function bestQFor(entries: RankedEntry[], language: "en" | "fr"): number | null {
  let best: number | null = null;
  for (const entry of entries) {
    if (entry.lang !== language && !entry.lang.startsWith(`${language}-`)) {
      continue;
    }
    if (best === null || entry.q > best) best = entry.q;
  }
  return best;
}

// Answers "en" only when English outranks French — a present, higher-scoring
// English entry beats an absent or lower-scoring French one. Everything else
// answers the default, including a French entry that ties or beats it, a
// header naming neither, and a missing/empty/unparseable header.
export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const entries = parseAcceptLanguage(acceptLanguage);
  const en = bestQFor(entries, "en");
  const fr = bestQFor(entries, "fr");

  if (en !== null && (fr === null || en > fr)) return "en";
  return DEFAULT_LOCALE;
}

// The BCP-47 tag Intl formatters want. Both Canadian, matching the "fr-CA"
// this project hard-coded everywhere before a second locale existed.
export function toBCP47(locale: Locale): string {
  return locale === "en" ? "en-CA" : "fr-CA";
}
