import bcrypt from "bcryptjs";

// Cost 12 in production. A parameter rather than a bare constant because a
// cost-12 hash is roughly 300ms and the tests want several of them — the same
// injection lib/whiteboard-hit.ts uses for its text measurer, and for the same
// reason: keep the module cheap to test without weakening what ships.
export const DEFAULT_COST = 12;

// The async form, never bcrypt.hashSync. One pm2 fork process serves every SSE
// stream in this app, and a 300ms synchronous hash stalls the ": ping" comments
// that keep those streams inside nginx's 60-second proxy_read_timeout — so a
// sync hash here is a broken chat, not a style preference.
export function hashPassword(
  password: string,
  cost: number = DEFAULT_COST,
): Promise<string> {
  return bcrypt.hash(password, cost);
}

// No cost argument: bcrypt carries the cost and the salt inside the hash
// string, so verifying uses whatever the stored value was written with.
export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
