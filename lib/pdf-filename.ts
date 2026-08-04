// The value of a Content-Disposition header, built from a string the teacher
// typed. That makes this a security control and not a formatting helper: a bare
// `"` ends the quoted form early, and a CR or LF is response-header injection.
//
// Both forms are emitted. `filename*` is what every current browser prefers and
// it can carry the accents a French title has; the quoted `filename` is the
// fallback, and it cannot carry a non-ASCII byte, so it gets a transliterated
// stem. Neither is trusted to be safe by being short — the ASCII form is an
// allowlist and the encoded form is percent-encoded, which leaves no byte that
// means anything to a header parser.

const MAX_STEM = 80;

function withoutPdfSuffix(value: string): string {
  return value.replace(/\.pdf$/i, "");
}

// NFKD first, then the allowlist. NFKD splits an accented letter into a letter
// plus a combining mark, and the allowlist keeps the letter while dropping the
// mark - so "e-acute" becomes "e" rather than vanishing, and an all-accented
// title still yields a readable stem instead of falling back to the slug. That
// is why there is no separate pass for the marks: the allowlist already is one.
function asciiStem(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ._-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_STEM)
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "");
}

// No control-character pass here, deliberately: encodeRfc5987 percent-encodes
// everything it cannot represent, so a stray control byte becomes %01 and never
// reaches the header as itself. Collapsing whitespace is for legibility.
function utf8Stem(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .slice(0, MAX_STEM)
    .trim();
}

// encodeURIComponent leaves ' ( ) * alone, and RFC 5987's attr-char does not
// admit them.
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDispositionInline(title: string, slug: string): string {
  const stem = withoutPdfSuffix(title);
  const ascii = asciiStem(stem);

  // One decision for both forms. If the title has nothing a filename can be
  // built from, the slug is the filename in both — otherwise the quoted form
  // would say "le-slug" while the encoded form said "——", and the browser
  // would pick whichever it prefers.
  const usable = ascii !== "";
  const quoted = usable ? ascii : slug;
  const encoded = encodeRfc5987(usable ? utf8Stem(stem) : slug);

  return `inline; filename="${quoted}.pdf"; filename*=UTF-8''${encoded}.pdf`;
}
