export type MarkupToken = {
  type: "text" | "bold" | "italic" | "code";
  value: string;
};

// Alternation order matters: ** must be tried before *, or "**x**" would be
// read as an italic span containing "*x*". Each span's body excludes its own
// delimiter, so an unclosed marker simply fails to match and stays literal.
const SPAN = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;

export function parseInlineMarkup(text: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SPAN)) {
    const start = match.index;
    if (start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, start) });
    }

    const [bold, code, italic] = [match[1], match[2], match[3]];
    if (bold !== undefined) tokens.push({ type: "bold", value: bold });
    else if (code !== undefined) tokens.push({ type: "code", value: code });
    else if (italic !== undefined) tokens.push({ type: "italic", value: italic });

    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }

  return tokens;
}
