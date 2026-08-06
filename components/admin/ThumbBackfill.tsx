"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { captureAndStoreThumbnail } from "@/components/html-thumbnail";
import { renderAndStorePdfThumbnail } from "@/components/pdf-thumbnail";

// How many to attempt on one visit. A bound, not a target: the objection the
// shelf's sandbox="" answers was ever only to a dozen documents running scripts
// at once, and this is the same objection met with a queue instead of a ban.
// Whatever is left over is picked up the next time she opens the tab.
const PER_VISIT = 5;

// Renders nothing, and is the reason there is no backfill script.
//
// A page published through POST /api/pages has no browser to be captured in —
// the dia script is a shell script talking to a server — so its preview can
// only ever be taken later, somewhere a DOM exists. This is that somewhere. It
// covers every html page that already existed at the same time, which is why
// no migration script is needed: one would have to render HTML on the server,
// which is the thing this whole design refuses (see the spec's non-goals, and
// scripts/backfill-page-assets.mjs for the shape being avoided).
//
// It covers pdf rows for a different reason: renderPdfThumbnail already runs
// in a browser, at upload — a student's, on a phone — but ShelfFab.submitPdf
// no longer waits out a slow one. This is where whatever that dropped gets a
// second try, in Jenn's browser on her next visit to the Pages tab.
//
// Failure is invisible and costs nothing. A null result leaves thumbAt null and
// the row is retried on a later visit, behind the live iframe or the glyph that
// was there all along — so nothing is recorded, nothing is retried within a
// visit, and nothing is reported to Jenn. This is an optimisation over a
// working fallback, and an optimisation that announces its own failures is
// worse than one that does not.
export function ThumbBackfill({
  pages,
}: {
  pages: { slug: string; version: string; kind: "html" | "pdf" }[];
}) {
  const router = useRouter();
  // Guards against a second pass in React's development double-invoke, and
  // against a re-render mid-run starting a parallel queue — which is exactly
  // the "a dozen at once" this component is shaped to avoid.
  const started = useRef(false);

  useEffect(() => {
    if (started.current || pages.length === 0) return;
    started.current = true;

    let cancelled = false;

    void (async () => {
      let stored = 0;
      // ONE AT A TIME, each awaited before the next begins. Serial for the same
      // reason a shelf frame has no allow-scripts: one document running its own
      // JavaScript in a hidden frame is the trade renderPdfThumbnail already
      // makes, and a queue of them is not. Dispatching on kind does not relax
      // that — a pdf render also imports pdf.js and spins up its worker, which
      // is exactly the kind of thing this loop exists to keep to one at a time.
      for (const page of pages.slice(0, PER_VISIT)) {
        if (cancelled) return;
        const ok =
          page.kind === "pdf"
            ? await renderAndStorePdfThumbnail(page.slug)
            : await captureAndStoreThumbnail(page.slug, page.version);
        if (ok) stored += 1;
      }

      // Once at the end, not once per page: each refresh re-renders the whole
      // grid, and doing that five times would cost more than the pictures are
      // worth.
      if (!cancelled && stored > 0) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [pages, router]);

  return null;
}
