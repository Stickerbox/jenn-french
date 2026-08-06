import { URL_PATTERN, trimTrailing } from "@/lib/chat-links";
import { parseLinkUrl } from "@/lib/link-url";

export type MessageSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string };

// Splits a chat message body into plain text and clickable links, so
// MessageList can stop rendering `{message.body}` as one dead string inside a
// whitespace-pre-wrap div.
//
// Reuses chat-links.ts's URL_PATTERN and trimTrailing rather than writing a
// second matcher, and validates through the same parseLinkUrl extractLinks
// defers to. Two matchers would mean a link extractLinks files onto the
// shelf but this does not draw, or the reverse — a discrepancy neither module
// alone could ever surface.
//
// label is the URL as the writer typed it, after trimTrailing (so a
// sentence's closing period is not part of the visible text); href is
// parseLinkUrl's normalised output — the same split extractLinks makes when
// it de-duplicates on the parsed value rather than the raw match.
export function linkifyBody(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trimmed = trimTrailing(raw);
    const parsed = parseLinkUrl(trimmed);

    // A candidate parseLinkUrl rejects stays plain text: leaving cursor where
    // it is means the rejected text is swept up whole by the next text
    // segment (or the final flush below), not dropped.
    if (!parsed.ok) continue;

    if (start > cursor) {
      segments.push({ kind: "text", value: body.slice(cursor, start) });
    }

    segments.push({ kind: "link", href: parsed.url, label: trimmed });

    // Advance past only the trimmed portion. Whatever trimTrailing stripped —
    // a full stop, a closing bracket with no opener to match — is not part of
    // the link and falls back into the surrounding text on the next pass.
    cursor = start + trimmed.length;
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", value: body.slice(cursor) });
  }

  // No URL at all: exactly one text segment, so an ordinary message costs the
  // caller nothing beyond what it already rendered.
  if (segments.length === 0) {
    segments.push({ kind: "text", value: body });
  }

  return segments;
}
