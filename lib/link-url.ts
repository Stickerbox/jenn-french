const MAX_URL_LENGTH = 2048;

export type LinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// The one guard between a student's typing and an href. Everything else about
// a link is cosmetic; this is not.
export function parseLinkUrl(input: unknown): LinkUrlResult {
  if (typeof input !== "string") {
    return { ok: false, error: "A link is required." };
  }

  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "A link is required." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "That link is too long." };
  }

  // Prefix ONLY when there is no scheme at all. Testing for a scheme first is
  // what stops "javascript:alert(1)" being rewritten to
  // "https://javascript:alert(1)" — a valid URL, and an accepted one.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "A link must start with http:// or https://." };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "That doesn't look like a link." };
  }

  return { ok: true, url: parsed.toString() };
}
