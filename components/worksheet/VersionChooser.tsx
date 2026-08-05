"use client";

import Link from "next/link";
import { versionLabel, slotForVersion } from "@/lib/version-labels";
import { formatLongDate } from "@/lib/format";
import { UploadVersion } from "@/components/worksheet/UploadVersion";

// A dialog, and its rows are ANCHORS rather than buttons. The whiteboard's
// leave-guard is a capture-phase click listener on document that inspects
// anchors, so an anchor is protected by it without knowing it exists — the same
// reason the admin's pencil had to stay one. A button calling router.push would
// slip past it.
export function VersionChooser({
  groupSlug,
  page,
  versions,
  audience,
  studentName,
  onClose,
}: {
  groupSlug: string;
  page: { slug: string; title: string; kind: "html" | "pdf" };
  versions: { fromTeacher: boolean; updatedAt: Date }[];
  audience: "student" | "teacher";
  studentName: string;
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-[var(--card-shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 font-[family-name:var(--card-font-serif)] text-lg text-[var(--card-ink)]">
          {page.title}
        </h2>

        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.slot}>
              <Link
                href={`${base}?v=${row.slot}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-[15px] text-[var(--card-ink)] hover:bg-[var(--card-creme)]"
              >
                <span>{versionLabel(row.slot, audience, studentName)}</span>
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
  );
}
