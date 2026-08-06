import { NextResponse } from "next/server";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { getPageBySlug } from "@/lib/pages";
import { getVersionHtml } from "@/lib/version-store";
import { SANDBOXED_DOCUMENT_CSP } from "@/lib/sandbox-csp";
import {
  withEditableBootstrap,
  withPrintableBootstrap,
  withSnapshotBootstrap,
} from "@/lib/printable-bootstrap";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  // 404 rather than 403, matching the chat route: a caller probing slugs learns
  // the same thing either way.
  if (!context || context.page.kind !== "html") {
    return new NextResponse("Not found", { status: 404 });
  }

  const asked = new URL(request.url).searchParams.get("v");

  let html: string | null;
  if (asked === "student" || asked === "teacher") {
    html = await getVersionHtml(
      context.page.id,
      context.group.id,
      asked === "teacher",
    );
  } else {
    // Anything else is the blank, including an absent parameter. A version that
    // does not exist falls back to nothing rather than to the blank: answering
    // a request for "Marie's answers" with an empty worksheet would be a
    // working feature showing the wrong thing.
    const page = await getPageBySlug(pageSlug);
    html = page?.html ?? null;
  }

  if (html === null) return new NextResponse("Not found", { status: 404 });

  // Three bootstraps, which is the one place in this codebase more than one is
  // appended together — and they stay independent listeners on one channel,
  // each keyed on its own event.data. The shell needs the Save pill, the print
  // pill, and an answer to whether this document can still be filled in at
  // all; the gate rule is unchanged: only this route asks, and /p/[slug]/raw
  // is untouched.
  const body = withEditableBootstrap(
    withSnapshotBootstrap(withPrintableBootstrap(html)),
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": SANDBOXED_DOCUMENT_CSP,
      "X-Content-Type-Options": "nosniff",
      // No ?v= cache token like /p/[slug]/raw has. That route can answer
      // `immutable` because it serves one public document; this serves one
      // named student's homework, and `private` on a shared device is not a
      // guarantee worth making.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
