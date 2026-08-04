import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPageBySlug } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { PrintButton, PAGE_FRAME_ID } from "@/components/PrintButton";

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

  // A pdf row cannot be served from here — bytes need a route handler and this
  // path is a page — so it redirects, and the PDF opens as a top-level
  // navigation in the browser's own viewer.
  //
  // That is the right outcome and not merely the available one. A PDF must not
  // be framed: iOS Safari renders only the first page of a framed PDF, which
  // would silently truncate every multi-page worksheet on the device most of
  // these students use.
  //
  // This is not the redirect forbidden above. That rule is about page.url, an
  // off-site string; this is a constant path on our own origin chosen by the
  // row's kind, with no input in it.
  if (kind === "pdf") redirect(`/p/${slug}/pdf`);

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
