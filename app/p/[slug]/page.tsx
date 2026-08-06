import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPageBySlug } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";
import { PrintButton, PAGE_FRAME_ID } from "@/components/PrintButton";
import { PdfShell, pdfShellButtonClass } from "@/components/pdf/PdfShell";
import { PdfDocumentView } from "@/components/pdf/PdfDocumentView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  return {
    title: page?.title ?? "Not found",
    // A student can publish a page now, and a slug is derived from a title and
    // therefore guessable. Nothing here should be crawlable.
    robots: { index: false, follow: false },
  };
}

export default async function PublishedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  // A link row has no document to frame. 404 and not a redirect to page.url:
  // /p/ means a page we host, and an open redirect on a public route is a
  // phishing primitive.
  if (!page) notFound();

  const kind = readPageKind(page);
  if (kind === "link") notFound();

  // A PDF still must not be FRAMED: iOS Safari renders only the first page of
  // a framed PDF, silently, which would truncate every multi-page worksheet on
  // the device most of these students use. What changed (2026-08-06) is that
  // this route no longer redirects a pdf row out to the browser's own viewer
  // to honour that rule — it rasterises the pages itself with pdf.js and
  // draws our own chrome on top, so a PDF opens inside the site with a back
  // control and stays on this origin. /p/[slug]/pdf is still exactly what it
  // was: the byte source PdfDocumentView streams from, AND the fallback this
  // page falls back to on any render failure (see PdfDocumentView's own
  // contract) — it matters MORE now, not less.
  if (kind === "pdf") {
    const locale = await currentLocale();
    const strings = getStrings(locale).pdfViewer;
    const pdfHref = `/p/${slug}/pdf`;

    return (
      <PdfShell
        // No group context reaches this route — a page has no student of its
        // own, only a slug — so there is nowhere to build a real "back to X"
        // link. history.back() is the one place in this feature a button
        // stands in for an anchor; see PdfShell's own comment on why that is
        // an accepted, narrow exception to "back must be a real <a>".
        back={{ kind: "history", label: strings.back }}
        center={
          <h1 className="truncate px-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]">
            {page.title}
          </h1>
        }
        actions={
          // Always present, not only on failure: the escape hatch to the
          // browser's own viewer — native search, zoom and print — that this
          // whole feature exists beside rather than instead of. Never a
          // canvas print: this component makes no claim to a print feature it
          // does not have.
          <a href={pdfHref} className={pdfShellButtonClass}>
            {strings.openInBrowser}
          </a>
        }
      >
        <PdfDocumentView src={pdfHref} fallbackHref={pdfHref} locale={locale} />
      </PdfShell>
    );
  }

  return (
    <>
      <iframe
        id={PAGE_FRAME_ID}
        // WITH ?printable=1, so the document carries the print listener. Every
        // other consumer of this route — the admin's download, every preview
        // thumbnail — omits the parameter and gets Jenn's exact bytes.
        src={`/p/${slug}/raw?printable=1`}
        title={page.title}
        // `allow-scripts` WITHOUT `allow-same-origin` is still the whole
        // security model: the framed document gets an opaque origin, so its
        // JavaScript runs but it cannot read our cookies, our storage, or the
        // teacher session. The two together would let the page remove its own
        // sandbox — never add it.
        //
        // `allow-modals` is a different kind of token and is safe to add here.
        // It grants alert, confirm, prompt and print — no origin, no cookies,
        // no storage. window.print() is gated behind it, and without it the
        // call is ignored outright. The worst a hostile document gains is
        // blocking this tab with an alert loop, which the allow-scripts it
        // already has can do with `while (true)`.
        sandbox="allow-scripts allow-modals"
        className="fixed inset-0 h-full w-full border-0 bg-white"
      />
      <PrintButton />
    </>
  );
}
