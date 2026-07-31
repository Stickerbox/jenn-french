import { NextResponse, type NextRequest } from "next/server";
import { cookieNameFor } from "@/lib/student-tokens";

// The one job here is moving ?k= out of the URL and into an httpOnly cookie,
// so the secret stops riding in browser history on every later visit. It does
// not validate the token — that needs the database, which middleware has no
// business touching. The page validates what it is handed.
export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("k");
  if (!token) return NextResponse.next();

  const slug = request.nextUrl.pathname.split("/")[2];
  if (!slug) return NextResponse.next();

  const clean = request.nextUrl.clone();
  clean.searchParams.delete("k");

  const response = NextResponse.redirect(clean);
  // Path "/" deliberately: a cookie scoped to /g/<slug> would never be sent to
  // /api/chat/<slug>. The per-student NAME is what keeps them separate.
  response.cookies.set(cookieNameFor(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export const config = {
  matcher: "/g/:slug/:path*",
};
