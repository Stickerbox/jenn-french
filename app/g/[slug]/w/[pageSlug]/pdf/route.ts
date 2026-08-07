import { NextResponse } from "next/server";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { getPagePdf } from "@/lib/pages";
import { getVersionPdf } from "@/lib/version-store";
import { contentDispositionInline } from "@/lib/pdf-filename";
import { versionLabel, type VersionSlot } from "@/lib/version-labels";
import { pickLocale } from "@/lib/i18n";

function readSlot(value: string | null): VersionSlot {
  if (value === "student" || value === "teacher") return value;
  return "blank";
}

// The gated mirror of /p/[slug]/pdf, with its headers copied rather than
// reinvented. There is deliberately NO Content-Security-Policy, for the reason
// that route records: a CSP on a PDF response constrains the browser's own
// viewer, and a directive that breaks PDFium renders a blank frame
// indistinguishable from a broken upload.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context || context.page.kind !== "pdf") {
    return new NextResponse("Not found", { status: 404 });
  }

  const slot = readSlot(new URL(request.url).searchParams.get("v"));

  let bytes: Uint8Array | null;
  if (slot === "blank") {
    const page = await getPagePdf(pageSlug);
    bytes = page?.pdf ? new Uint8Array(page.pdf) : null;
  } else {
    bytes = await getVersionPdf(
      context.page.id,
      context.group.id,
      slot === "teacher",
    );
  }
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  // The label goes into the FILENAME, so three downloads are three files rather
  // than three copies of one name. contentDispositionInline is what makes that
  // safe: a title reaching a response header is where a `"` ends the quoted form
  // early and a CR or LF is header injection.
  //
  // The language follows the browser here as it does on the page this
  // download came from, so a French-reading teacher and an English-reading
  // student each get a filename they can read. `pickLocale` rather than
  // `currentLocale()`: this is a route handler with the request in hand, and
  // `currentLocale()` reads `headers()`, which is the server-component half.
  const filename = `${context.page.title} — ${versionLabel(
    slot,
    context.role === "teacher" ? "teacher" : "student",
    context.group.name,
    pickLocale(request.headers.get("accept-language")),
  )}`;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(filename, context.page.slug),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
