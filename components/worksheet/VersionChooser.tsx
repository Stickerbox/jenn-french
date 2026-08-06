"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  versionLabel,
  slotForVersion,
  type VersionSlot,
} from "@/lib/version-labels";
import { formatLongDate } from "@/lib/format";
import { pageVersion } from "@/lib/page-version";
import { HtmlPreview } from "@/components/ui/HtmlPreview";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { UploadVersion } from "@/components/worksheet/UploadVersion";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

// A dialog, and its rows are ANCHORS rather than buttons. The whiteboard's
// leave-guard is a capture-phase click listener on document that inspects
// anchors, so an anchor is protected by it without knowing it exists — the same
// reason the admin's pencil had to stay one. A button calling router.push would
// slip past it.

// One dot colour per slot, so the three rows read apart before anyone reads a
// word: gold for the blank as issued, the same blue the shelf tile's own
// version-count badge uses for the student's answers, and the traditional red
// pen for Jenn's correction.
const SLOT_DOT: Record<VersionSlot, string> = {
  blank: "bg-[var(--card-or)]",
  student: "bg-[var(--card-bleu)]",
  teacher: "bg-[var(--card-rouge)]",
};

export function VersionChooser({
  groupSlug,
  page,
  versions,
  audience,
  studentName,
  onClose,
}: {
  groupSlug: string;
  page: {
    slug: string;
    title: string;
    kind: "html" | "pdf";
    updatedAt: Date;
    // The preview's existence signal and its cache version — see PdfPreview
    // and HtmlPreview. Widened onto this prop rather than looked up again here:
    // FilesTab already has both on the ShelfPage row it opens the chooser from.
    thumbAt: Date | null;
    pdfSize: number | null;
  };
  versions: { fromTeacher: boolean; updatedAt: Date }[];
  audience: "student" | "teacher";
  studentName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const base =
    page.kind === "pdf"
      ? `/g/${groupSlug}/w/${page.slug}/pdf`
      : `/g/${groupSlug}/w/${page.slug}`;

  const rows = [
    { slot: "blank" as const, at: null },
    ...versions.map((version) => ({
      slot: slotForVersion(version.fromTeacher),
      at: version.updatedAt,
    })),
  ];

  // One expression for both previews, the same one FilesTab computes for the
  // tile this dialog opened from — see PageList for why it is one line and not
  // two.
  const thumbVersion = page.thumbAt ? new Date(page.thumbAt).getTime() : null;

  // Fills the small square its wrapper draws, rather than keeping the
  // previews' own aspect-[4/3] at the dialog's full width. A full-bleed
  // preview promised more than it delivers: a document laid out five times
  // this box's width leaves its content in one corner of a wide band, which
  // reads as a broken picture rather than a small one. A square that is
  // plainly a thumbnail promises nothing it cannot keep. Both previews already
  // fill whatever box they are given — object-cover one side, the scaled frame
  // the other — so this crops instead of letterboxing.
  const preview =
    page.kind === "pdf" ? (
      <PdfPreview
        slug={page.slug}
        size={page.pdfSize}
        thumbVersion={thumbVersion}
        className="h-full w-full"
      />
    ) : (
      <HtmlPreview
        slug={page.slug}
        version={pageVersion(page.updatedAt)}
        thumbVersion={thumbVersion}
        className="h-full w-full"
      />
    );

  const eyebrow = audience === "teacher" ? "Worksheet versions" : "Versions du devoir";
  const closeLabel = audience === "teacher" ? "Close" : "Fermer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-chooser-title"
        // The backdrop closes; a click on the box must not bubble up to it.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--card-paper)] shadow-[var(--card-shadow)]"
      >
        <div className="relative p-4">
          {/* In the dialog's own corner, not over the preview: over a picture
              it needed its own opaque disc to stay legible, and that disc read
              as a control belonging to the document rather than to the box. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={cn(
              "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-[var(--card-moss)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
              cardFocusRing,
            )}
          >
            ×
          </button>

          {/* The preview is what makes this dialog read as ONE homework's
              versions rather than a generic menu — the same picture the shelf
              tile showed, so the thing the student pressed is the thing they
              see again here. Centred and small, with a border and a shadow of
              its own: it is a thumbnail of a document, and a box drawn around
              it says so where a full-width band said "this is the document". */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="aspect-square w-36 overflow-hidden rounded-xl border border-[var(--card-line)] bg-white shadow-[var(--card-shadow)]">
              {preview}
            </div>
            <div>
              <p className="mb-1 font-[family-name:var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--card-bleu)]">
                {eyebrow}
              </p>
              <h2
                id="version-chooser-title"
                className="font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]"
              >
                {page.title}
              </h2>
            </div>
          </div>

          {/* The list goes back to the left edge: the header is a heading and
              centres, the rows are a list and a ragged left edge is what makes
              three of them scannable. */}
          <ul className="mt-4 flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.slot}>
                <Link
                  href={`${base}?v=${row.slot}`}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-[15px] text-[var(--card-ink)] transition-colors duration-150 hover:border-[var(--card-line)] hover:bg-[var(--card-section)] motion-reduce:transition-none",
                    cardFocusRing,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      SLOT_DOT[row.slot],
                    )}
                  />
                  <span className="flex-1">
                    {versionLabel(row.slot, audience, studentName)}
                  </span>
                  {row.at && (
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      {formatLongDate(row.at)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* A PDF has nowhere else this control could live. An html worksheet's
              Save pill is on the document itself, so it gets none here. */}
          {page.kind === "pdf" && (
            <UploadVersion
              groupSlug={groupSlug}
              pageSlug={page.slug}
              audience={audience}
            />
          )}
        </div>
      </div>
    </div>
  );
}
