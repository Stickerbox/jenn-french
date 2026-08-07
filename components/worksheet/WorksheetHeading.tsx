"use client";

import { cn } from "@/lib/utils";
import { ShellTitle } from "@/components/ui/ShellBar";
import { versionLabel, type VersionSlot } from "@/lib/version-labels";
import type { Locale } from "@/lib/i18n";

// The middle of a worksheet's bar, for BOTH kinds — the html shell's iframe
// and the pdf shell's canvases. It was written twice, once in each, with a
// comment on the second copy asking the reader to keep them in step by eye;
// this is that comment deleted rather than honoured.
//
// **THE TABS HIDE WHEN THERE IS NOTHING TO CHOOSE — unless the caller says
// otherwise.** `slots` holds the blank for Jenn, so a worksheet nobody has
// saved to drew a strip of exactly one tab, already selected, that did nothing
// when pressed — a control that cannot act, above every worksheet on its first
// opening. The document's name goes there instead.
//
// `showWhenAlone` is the student's html worksheet, and it opts out on purpose
// (2026-08-07). Their single tab is not a chooser that cannot act; it is a
// LABEL that says whose copy this is, and it is the anchor Jenn's correction
// appears beside. Without it the strip materialises out of nothing the day she
// corrects, and a control that appears where a title used to be reads as a
// glitch rather than as news. With it, the same strip simply gains a second
// tab, which is the actual event.
//
// The accepted cost is that a student on one tab no longer sees the document's
// title in the bar. They arrived by pressing that document's tile, so it is
// the thing they are least likely to have forgotten.
export function WorksheetHeading({
  slots,
  slot,
  audience,
  studentName,
  title,
  locale,
  showWhenAlone = false,
}: {
  slots: VersionSlot[];
  slot: VersionSlot;
  audience: "student" | "teacher";
  studentName: string;
  title: string;
  // The LOCALE, never a resolved Strings object — see lib/strings.ts.
  locale: Locale;
  // A prop rather than `audience === "student"`, so the pdf shell — which
  // shows both parties the old three-slot reading and is otherwise untouched
  // by the one-copy change — keeps drawing its title at a single version.
  showWhenAlone?: boolean;
}) {
  if (slots.length < 2 && !showWhenAlone) return <ShellTitle>{title}</ShellTitle>;

  return (
    // `p-1.5` and not `p-1`. Both the strip and its pills are `rounded-full`,
    // so at 4px the gap between the two curves closed to a hairline at the
    // corners and the selected tab read as though it had been cut out of its
    // own container rather than sitting in it.
    //
    // This keeps `overflow-x-auto` — three French labels are wider than a
    // phone — which is safe here and was not on the track above: the pills
    // carry no shadow of their own, so there is no vertical overflow for the
    // implied `overflow-y` to clip.
    <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1.5 shadow-[var(--card-shadow)]">
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
          {versionLabel(s, audience, studentName, locale)}
        </a>
      ))}
    </div>
  );
}
