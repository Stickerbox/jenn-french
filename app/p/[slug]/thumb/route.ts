import { NextResponse } from "next/server";
import { getPageThumb } from "@/lib/pages";

// The third mirror of one contract: /raw serves only an html row and /pdf only
// a pdf row's document. This one serves a picture, of either kind — a pdf's
// first page or an html document's laid-out top — because the columns behind it
// mean "the picture" and never meant "the PDF's picture". It still 404s
// everything else, and it still has headers the other two could not share,
// which is why there are three files rather than one handler branching on kind.
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
  // No kind check. A row with a stored picture is the only thing this serves,
  // and the columns are the authority on that — a kind check here would 404 the
  // html previews this route now exists to carry.
  //
  // A row with no preview 404s rather than falling back to anything. The tile
  // only builds this URL when thumbAt is non-null, so reaching here means a
  // hand-typed URL or a row edited underneath a cached page.
  if (!page || page.thumb === null || page.thumbAt === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(page.thumb), {
    headers: {
      "Content-Type": "image/jpeg",
      // Never let a mislabelled blob be re-interpreted as something executable.
      "X-Content-Type-Options": "nosniff",
      // Matches what the raw route grew on 2026-08-02.
      "X-Robots-Tag": "noindex",
      // A YEAR, and safe ONLY because the tile appends ?v=<thumbAt>. On a
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
