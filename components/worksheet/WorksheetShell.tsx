"use client";

import { useCallback, useEffect, useState } from "react";
import { EDITABLE_MESSAGE } from "@/lib/printable-bootstrap";
import { ShellBar } from "@/components/ui/ShellBar";
import { WorksheetHeading } from "@/components/worksheet/WorksheetHeading";
import { PrintButton } from "@/components/PrintButton";
import { WORKSHEET_FRAME_ID } from "@/components/worksheet/frame";
import { useWorksheetAutosave } from "@/components/worksheet/useWorksheetAutosave";
import type { VersionSlot } from "@/lib/version-labels";

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
  writable,
  hasOwnVersion,
  sent,
}: {
  groupSlug: string;
  pageSlug: string;
  title: string;
  audience: "student" | "teacher";
  studentName: string;
  slot: VersionSlot;
  slots: VersionSlot[];
  writable: boolean;
  hasOwnVersion: boolean;
  sent: boolean;
}) {
  // The server's answers, held locally because the first auto-save changes
  // both of them without a reload.
  const [ownExists, setOwnExists] = useState(hasOwnVersion);
  const [announced, setAnnounced] = useState(sent);
  const [tabs, setTabs] = useState(slots);
  const [current, setCurrent] = useState(slot);

  const onSaved = useCallback(() => {
    // Every save clears sentAt on the server, so the button comes back to
    // life here to match.
    setAnnounced(false);
    if (ownExists) return;
    setOwnExists(true);

    // THE FIRST SAVE MOVES THE SHELL IN PLACE, and does not reload. The frame's
    // DOM already IS the new version — a reload would fetch the same bytes back
    // and throw away any key pressed during it.
    //
    // This is what Jenn sees: she starts on Marie's answers with no correction,
    // types, and ten seconds later she is on "My correction" holding the
    // document she has been typing in. The address now agrees with where her
    // work went.
    const mine: VersionSlot = audience === "teacher" ? "teacher" : "student";
    setTabs((existing) =>
      existing.includes(mine)
        ? existing
        : // Blank, then the student, then Jenn — the order visibleSlots and
          // listVersions both keep, so the strip does not reshuffle on reload.
          (["blank", "student", "teacher"] as VersionSlot[]).filter(
            (candidate) => existing.includes(candidate) || candidate === mine,
          ),
    );
    setCurrent(mine);
    window.history.replaceState(null, "", `?v=${mine}`);
  }, [audience, ownExists]);

  const { dirty, editable, error, flush } = useWorksheetAutosave({
    groupSlug,
    pageSlug,
    audience,
    writable,
    onSaved,
  });

  // The browser's own leave prompt, armed only while a write is outstanding.
  // Auto-save shrinks the window it guards from "since you last pressed the
  // pill" to "the last ten seconds", which is the point — but ten seconds of a
  // student's answers is still worth a dialog.
  //
  // It covers the version tabs, the back control and closing the tab, because
  // each is a real document navigation: those are plain anchors, not
  // next/link. It does NOT cover browser Back — the same accepted gap the
  // whiteboard's leave-guard records, since beforeunload does not fire for an
  // App Router popstate.
  useEffect(() => {
    if (!dirty || !writable) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      // Both, because browsers disagree about which one arms the dialog, and
      // no browser lets the wording be chosen.
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, writable]);

  return (
    <>
      <ShellBar
        variant="floating"
        ariaLabel={audience === "teacher" ? "Versions" : "Versions du devoir"}
        back={{
          href: `/g/${groupSlug}?tab=files`,
          label: audience === "teacher" ? "Back to files" : "Les fichiers",
          kind: "link",
        }}
        center={
          <WorksheetHeading
            slots={tabs}
            slot={current}
            audience={audience}
            studentName={studentName}
            title={title}
          />
        }
      />
      <iframe
        id={WORKSHEET_FRAME_ID}
        src={`/g/${groupSlug}/w/${pageSlug}/raw?v=${slot}`}
        title={title}
        sandbox="allow-scripts allow-modals"
        className="fixed inset-0 h-full w-full border-0 bg-white"
        // Asked on load rather than announced by the document on its own: the
        // listener above is attached on mount, which is before this fires, so
        // there is no window in which an unprompted answer could be missed.
        onLoad={(event) => {
          // "*" because the frame's origin is opaque — there is no origin
          // string that would match it. The listener inside authenticates us
          // from the other side, by checking that the sender is its parent.
          event.currentTarget.contentWindow?.postMessage(EDITABLE_MESSAGE, "*");
        }}
      />
      {/* One fixed container rather than two independently-positioned pills:
          "Enregistrer mes réponses" is wider than the horizontal offset this
          used to reserve for it, so the French labels overlapped on screen.
          A fixed horizontal offset is a guess about the longest string in any
          language; a column has no such guess to make. */}
      <div className="fixed bottom-5 right-5 z-10 flex flex-col items-end gap-2 print:hidden">
        <PrintButton className="static" frameId={WORKSHEET_FRAME_ID} />
        {error && (
          <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
