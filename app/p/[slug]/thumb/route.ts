import { NextResponse } from "next/server";
import { getPageThumb } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";

// The third mirror of one contract: /raw serves only an html row, /pdf only a
// pdf row's document, and this one only a pdf row's preview. Each 404s the
// others. One handler branching on kind under three header regimes is the thing
// a later edit gets wrong, which is why there are three files.
//
// Public, exactly like /p/[slug] and /p/[slug]/pdf. It leaks strictly less than
// the document it summarises, and the note that a PDF put here is a PDF on the
// public web is unchanged and still the thing to read before uploading one.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const page = await getPageThumb(slug);
  if (!page || readPageKind(page) !== "pdf") {
    return new NextResponse("Not found", { status: 404 });
  }
  // A pdf row with no preview 404s rather than falling back to anything. The
  // tile only builds this URL when pdfThumbAt is non-null, so reaching here
  // means a hand-typed URL or a row edited underneath a cached page.
  if (page.pdfThumb === null || page.pdfThumbAt === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(page.pdfThumb), {
    headers: {
      "Content-Type": "image/jpeg",
      // Never let a mislabelled blob be re-interpreted as something executable.
      "X-Content-Type-Options": "nosniff",
      // Matches what the raw route grew on 2026-08-02.
      "X-Robots-Tag": "noindex",
      // A YEAR, and safe ONLY because the tile appends ?v=<pdfThumbAt>. On a
      // stable URL this would pin a replaced document's picture in every browser
      // that had ever seen it, with no way to evict it. This route and
      // PdfPreview are two halves of one decision; neither can change alone.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  // No Content-Disposition: this is never downloaded, only rendered in a tile.
  // No Content-Security-Policy, matching /p/[slug]/pdf: there is nothing in an
  // image response for a directive to constrain, and the argument against adding
  // one whose effect on a browser's own decoder cannot be verified from here
  // applies unchanged.
}
