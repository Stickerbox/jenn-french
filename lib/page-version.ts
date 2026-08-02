// The cache key for a page's preview. Base 36 rather than the raw millisecond
// count only to keep it short: this string is appended to every tile's iframe
// src, and a shelf renders a dozen of them.
//
// An invalid Date returns "" rather than "NaN". The route compares the request's
// ?v= against this, and two invalid dates producing the same non-empty token
// would make a mismatch look like a match — the one comparison that must never
// give a false positive, because a false positive is a year-long immutable
// header on the wrong document.
export function pageVersion(updatedAt: Date): string {
  const ms = updatedAt.getTime();
  if (!Number.isFinite(ms)) return "";
  return ms.toString(36);
}
