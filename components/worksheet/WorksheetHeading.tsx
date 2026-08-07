"use client";

import { cn } from "@/lib/utils";
import { ShellTitle } from "@/components/ui/ShellBar";
import { versionLabel, type VersionSlot } from "@/lib/version-labels";

// The middle of a worksheet's bar, for BOTH kinds — the html shell's iframe
// and the pdf shell's canvases. It was written twice, once in each, with a
// comment on the second copy asking the reader to keep them in step by eye;
// this is that comment deleted rather than honoured.
//
// **THE TABS HIDE WHEN THERE IS NOTHING TO CHOOSE.** `slots` always holds the
// blank, so a worksheet nobody has saved to yet drew a strip of exactly one
// tab, already selected, that did nothing when pressed — a control that
// cannot act, above every worksheet on its first opening, which is most of
// them. The document's name goes there instead: the bar always says what you
// are looking at, and starts offering versions at the moment a second one
// exists.
export function WorksheetHeading({
  slots,
  slot,
  audience,
  studentName,
  title,
}: {
  slots: VersionSlot[];
  slot: VersionSlot;
  audience: "student" | "teacher";
  studentName: string;
  title: string;
}) {
  if (slots.length < 2) return <ShellTitle>{title}</ShellTitle>;

  return (
    <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1 shadow-[var(--card-shadow)]">
      {slots.map((s) => (
        // A plain anchor, not a button calling router.push: the whiteboard's
        // capture-phase leave-guard (lib/leave-guard.ts) inspects real anchors
        // on the document, so these are protected by it for free without
        // knowing it exists — the same reason the admin's edit pencil stayed
        // one. It is also what makes the html shell's `beforeunload` fire when
        // a student with unsaved answers switches version.
        <a
          key={s}
          href={`?v=${s}`}
          aria-current={s === slot ? "page" : undefined}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors motion-reduce:transition-none",
            s === slot
              ? "bg-[var(--card-bleu)] text-white"
              : "text-[var(--card-moss)]",
          )}
        >
          {versionLabel(s, audience, studentName)}
        </a>
      ))}
    </div>
  );
}
