// What a student may type into the sign-in form. Pure, so the byte boundary
// below is provable in a test rather than discovered in production.

export type CredentialProblem = "bad-email" | "too-short" | "too-long";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const MIN_PASSWORD_LENGTH = 8;

// bcrypt silently truncates its input past 72 bytes, so two long passwords
// sharing a 72-byte prefix both verify against the same hash — see the last
// case in tests/lib/password-hash.test.ts, which pins that behaviour. Rejecting
// is the only honest answer, and the limit is in BYTES: this is a French site,
// "é" is two bytes in UTF-8, and a 40-character accented passphrase is already
// over the line while its `.length` is 40.
export const MAX_PASSWORD_BYTES = 72;

// TextEncoder rather than Buffer.byteLength: this module is imported by
// components/student/StudentAuthPanel.tsx, a client component, and Buffer is
// not available in the browser bundle.
const encoder = new TextEncoder();

// Trimmed and lowercased because this is an identifier we compare on sign-in
// and will one day mail. Deliberately loose about shape: the only authority on
// whether an address works is sending to it, and an over-strict pattern rejects
// addresses that do.
export function normaliseEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_SHAPE.test(trimmed)) return null;
  return trimmed;
}

// Deliberately NOT trimmed, unlike the email: trimming silently changes what
// someone typed, and their password manager's saved value would then stop
// matching what the form sends.
export function checkPassword(raw: string): CredentialProblem | null {
  if (raw.length < MIN_PASSWORD_LENGTH) return "too-short";
  if (encoder.encode(raw).length > MAX_PASSWORD_BYTES) return "too-long";
  return null;
}
