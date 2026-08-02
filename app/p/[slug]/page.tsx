import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPageBySlug } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";

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
  if (!page || readPageKind(page) === "link") notFound();

  // `allow-scripts` WITHOUT `allow-same-origin` is the whole security model:
  // the framed document gets an opaque origin, so its JavaScript runs but it
  // cannot read our cookies, our storage, or the teacher session. The two
  // tokens together would let the page remove its own sandbox — never add it.
  return (
    <iframe
      src={`/p/${slug}/raw`}
      title={page.title}
      sandbox="allow-scripts"
      className="fixed inset-0 h-full w-full border-0 bg-white"
    />
  );
}
