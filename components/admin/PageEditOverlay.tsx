"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AddSheet } from "@/components/ui/AddSheet";
import { PageEditor } from "@/components/admin/PageEditor";
import {
  deletePage,
  loadPageForEdit,
  updatePage,
  updatePdfPage,
} from "@/app/page-actions";

type Loaded = Awaited<ReturnType<typeof loadPageForEdit>>;

// The edit form, in a sheet over whichever list opened it — the admin's Pages
// tab or a student's shelf. Driven by ?edit=<slug> rather than local state, and
// that is not a style preference; see the pencil's own comment in PageList for
// the four things it buys, of which the leave-guard is the one that would be
// hard to add later.
//
// PageEditor itself is used UNMODIFIED. It is the form /admin/pages/[slug]
// already renders, bound to the same teacher-only actions, so there is exactly
// one edit form in this codebase and no second copy to drift.
//
// Two accepted awkwardnesses, both on a teacher-only surface. The editor is
// styled in the admin's --color-* palette and will sit on a --card-* page when
// opened from a student's shelf; and the audience checkboxes let Jenn un-assign
// the page from the very shelf she is looking at, which is real power exercised
// in the obvious place. Neither is worth a second editor — that is the whole
// point of reusing this one.
export function PageEditOverlay({
  slug,
  closeTo,
}: {
  slug: string | null;
  // Where closing goes: the same URL without ?edit=. A href rather than a
  // callback so a server component can mount this directly — the student page
  // is one, and a callback would have forced a wrapper whose only job was to
  // hold a router.
  closeTo: string;
}) {
  const router = useRouter();
  const onClose = useCallback(() => {
    router.push(closeTo);
  }, [router, closeTo]);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [pending, setPending] = useState(false);

  // Cleared during render rather than in the effect, the same shape PageEditor
  // and NewPageForm use for a default that follows a prop:
  // react-hooks/set-state-in-effect rejects the effect form, and an effect
  // would paint the PREVIOUS page's title and audience for one frame before
  // correcting — on a form that saves, showing the wrong page's fields even
  // briefly is worse than a flash.
  const [lastSlug, setLastSlug] = useState(slug);
  if (lastSlug !== slug) {
    setLastSlug(slug);
    setLoaded(null);
    setPending(slug !== null);
  }

  useEffect(() => {
    if (slug === null) return;

    let cancelled = false;

    void loadPageForEdit(slug)
      .then((result) => {
        if (cancelled) return;
        setPending(false);
        // Null is a deleted page or a link row, and both close rather than
        // leaving an empty dialog open: a stale ?edit= in a bookmark or a
        // back-button must not look like a form that failed to load.
        if (!result) {
          onClose();
          return;
        }
        setLoaded(result);
      })
      .catch(() => {
        if (cancelled) return;
        setPending(false);
        onClose();
      });

    return () => {
      cancelled = true;
    };
  }, [slug, onClose]);

  if (slug === null) return null;

  return (
    <AddSheet title="Edit page" closeLabel="Close" onClose={onClose}>
      {pending || !loaded ? (
        <p className="py-4 text-center text-sm text-[var(--color-ink-muted)]">
          Loading…
        </p>
      ) : (
        <PageEditor
          groups={loaded.groups}
          initial={{
            title: loaded.page.title,
            // Empty for a pdf row, which has no document to hold. The kind is
            // what decides which of the two the form submits.
            html: loaded.page.html ?? "",
            groupIds: loaded.page.groupIds,
            kind: loaded.page.kind,
            pdfSize: loaded.page.pdfSize,
            worksheet: loaded.page.worksheet,
          }}
          submitLabel="Save"
          onSubmit={updatePage.bind(null, loaded.page.slug)}
          onSubmitPdf={updatePdfPage.bind(null, loaded.page.slug)}
          onDelete={async () => {
            await deletePage(loaded.page.slug);
            // Close and refresh rather than router.push("/admin?tab=pages"),
            // which is what the standalone route does: the list is already
            // behind this sheet, and on a student's shelf that push would
            // navigate her off the page she was looking at.
            onClose();
            router.refresh();
          }}
        />
      )}
    </AddSheet>
  );
}
