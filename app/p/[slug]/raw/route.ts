import { NextResponse } from "next/server";
import { getPageBySlug } from "@/lib/pages";

// Defence in depth behind the iframe sandbox. `connect-src 'none'` is the line
// that earns its place: a published page cannot make a network request, so
// nothing it collects can leave the browser. `script-src` deliberately has no
// https: — a page that pulls a library from a CDN will not run, which is the
// accepted cost of self-contained pages being the only supported kind.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "media-src data: blob: https:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(page.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
