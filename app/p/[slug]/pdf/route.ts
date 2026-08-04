import { NextResponse } from "next/server";
import { getPagePdf } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { contentDispositionInline } from "@/lib/pdf-filename";

// The mirror of /p/[slug]/raw's contract: that route refuses every row that is
// not html, this one refuses every row that is not pdf. Two routes rather than
// one handler switching on kind, because the two want different headers and one
// handler serving two content types under two header regimes is what a later
// edit gets wrong.
//
// There is deliberately NO Content-Security-Policy here. A CSP on a PDF
// response constrains the browser's own viewer, and what `default-src 'none'`
// does to PDFium or pdf.js cannot be verified from a terminal — a directive
// that breaks the viewer renders a blank frame, indistinguishable from a broken
// upload. The threat it would answer is small and bounded: a PDF may carry
// JavaScript, but a PDF script engine has no DOM and no access to this origin's
// cookies or storage, and these files are the teacher's own uploads behind a
// teacher-only control. If PDFs are ever opened to student upload, revisit this
// line first.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await getPagePdf(slug);
  if (!page || readPageKind(page) !== "pdf" || page.pdf === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(page.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline, so the browser opens its built-in viewer — which brings the
      // download, print, search and page controls this feature would otherwise
      // have to build. The filename is what that viewer's own download button
      // saves as.
      "Content-Disposition": contentDispositionInline(page.title, page.slug),
      // A mislabelled upload must never be re-interpreted as something
      // executable.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
