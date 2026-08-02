const MAX_TITLE_LENGTH = 120;

// The five that matter in a title, plus nbsp. Not a general entity table:
// anything else stays literal, which is a cosmetic wrong rather than a broken
// one, and React escapes the result on the way out either way.
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function clean(inner: string): string | null {
  // Strip first, decode second. Decoding first would turn an author's escaped
  // "&lt;b&gt;" into a real tag and then delete it.
  const text = inner
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;
  return text.slice(0, MAX_TITLE_LENGTH);
}

// A regex, not a parser. The same posture lib/inline-markup.ts takes: this runs
// on a document nobody validated, a wrong answer here is cosmetic, and the
// caller already has a fallback. Pulling in a DOM parser to name a file would
// be the project's first utility dependency.
export function titleFromHtml(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) {
    const text = clean(title[1]);
    if (text) return text;
  }

  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (heading) {
    const text = clean(heading[1]);
    if (text) return text;
  }

  return null;
}
