import { randomBytes } from "crypto";

export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export { cookieNameFor } from "@/lib/cookie-name";

// Two plain strings rather than a request object, so the precedence rule is
// testable without a server.
//
// The query wins: a freshly shared link has to override a stale cookie, or a
// student whose token Jenn regenerated could never get back in — their browser
// would keep presenting the revoked one.
export function readToken(
  fromQuery: string | undefined,
  fromCookie: string | undefined,
): string | null {
  return fromQuery || fromCookie || null;
}
