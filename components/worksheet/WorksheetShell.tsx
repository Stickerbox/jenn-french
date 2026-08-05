"use client";

import { cn } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import {
  SaveVersionButton,
  WORKSHEET_FRAME_ID,
} from "@/components/worksheet/SaveVersionButton";
import { versionLabel, type VersionSlot } from "@/lib/version-labels";

// The full-screen sandboxed frame a student (or Jenn, correcting) fills in.
// Modelled on /p/[slug]/page.tsx, whose sandbox comment this repeats because
// the reasoning is identical: `allow-scripts` WITHOUT `allow-same-origin` is
// the whole security model. Together they would let the framed document strip
// its own sandbox; `allow-modals` is the safe addition beside it, gating only
// window.print() with no origin, cookies or storage of its own.
export function WorksheetShell({
  groupSlug,
  pageSlug,
  title,
  audience,
  studentName,
  slot,
  slots,
}: {
  groupSlug: string;
  pageSlug: string;
  title: string;
  audience: "student" | "teacher";
  studentName: string;
  slot: VersionSlot;
  slots: VersionSlot[];
}) {
  return (
    <>
      <nav
        aria-label={audience === "teacher" ? "Versions" : "Versions du devoir"}
        className="fixed inset-x-0 top-0 z-10 flex justify-center px-4 pt-4 print:hidden"
      >
        <div className="flex gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1 shadow-[var(--card-shadow)]">
          {slots.map((s) => (
            // A plain anchor, not a button calling router.push: a future live
            // whiteboard's capture-phase leave-guard (lib/leave-guard.ts)
            // inspects real anchors on the document, and this control is
            // protected by it for free without knowing it exists — the same
            // reason the admin's edit pencil stayed an <a>.
            <a
              key={s}
              href={`?v=${s}`}
              aria-current={s === slot ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors",
                s === slot
                  ? "bg-[var(--card-bleu)] text-white"
                  : "text-[var(--card-moss)]",
              )}
            >
              {versionLabel(s, audience, studentName)}
            </a>
          ))}
        </div>
      </nav>
      <iframe
        id={WORKSHEET_FRAME_ID}
        src={`/g/${groupSlug}/w/${pageSlug}/raw?v=${slot}`}
        title={title}
        sandbox="allow-scripts allow-modals"
        className="fixed inset-0 h-full w-full border-0 bg-white"
      />
      {/* Shifted left of the Save pill so the two fixed bottom-right controls
          do not paint over each other — see the CLAUDE.md note on the corner
          InboxFab and the add FAB already share. */}
      <PrintButton className="right-44" />
      <SaveVersionButton
        groupSlug={groupSlug}
        pageSlug={pageSlug}
        audience={audience}
      />
    </>
  );
}
