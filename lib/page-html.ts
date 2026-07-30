export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type PageHtmlResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

// Bytes, not characters. A page of accented French or inlined data-URI images
// takes more room on disk than String.length suggests, and the cap exists to
// protect the database, which stores bytes.
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validatePageHtml(input: unknown): PageHtmlResult {
  if (typeof input !== "string") {
    return { ok: false, error: "The page HTML is missing." };
  }

  const html = input.trim();
  if (!html) return { ok: false, error: "The page HTML is missing." };

  if (byteLength(html) > MAX_PAGE_BYTES) {
    return { ok: false, error: "That page is larger than 2 MB." };
  }

  // Catches the obvious slip of pasting a URL or a filename instead of the
  // document. It is not an attempt to parse HTML — nothing here validates
  // the markup, because the page is rendered as-is by design.
  if (!html.includes("<")) {
    return { ok: false, error: "That doesn't look like an HTML page." };
  }

  return { ok: true, html };
}
