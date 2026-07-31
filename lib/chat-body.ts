// Long enough for a pasted paragraph of corrections, short enough that the
// column cannot be used as free storage by anyone holding a student's token.
export const MAX_MESSAGE_LENGTH = 4000;

// Returns the message to store, or null if there is nothing worth storing.
// Trims first and measures after, so trailing whitespace cannot push an
// otherwise-valid message over the limit.
export function parseMessageBody(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) return null;

  return trimmed;
}
