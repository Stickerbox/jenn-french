// A thumbnail is produced by Jenn's browser, because there is no server-side
// canvas here and adding one would mean a native dependency. That makes it
// client-supplied data which ends up in an <img src> on the student's page, so
// it is validated on the way in even though only the teacher can send it.
export const THUMBNAIL_PREFIX = "data:image/jpeg;base64,";

// A 320px-wide JPEG of a whiteboard page is a few KB. 64k characters of base64
// is roughly 48KB of image — generous, and a bound on what fifty archive rows
// can cost to read.
export const MAX_THUMBNAIL_CHARS = 64 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function isThumbnail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > MAX_THUMBNAIL_CHARS) return false;
  if (!value.startsWith(THUMBNAIL_PREFIX)) return false;

  const payload = value.slice(THUMBNAIL_PREFIX.length);
  return payload.length > 0 && BASE64.test(payload);
}
