"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { cardFocusRing } from "@/components/card-styles";
import { DIRTY_MESSAGE, EDITABLE_MESSAGE } from "@/lib/printable-bootstrap";
import { canSaveFromSlot } from "@/lib/worksheet-save-slots";
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
  // null until the document has answered. Starts null on the server too, so
  // there is nothing for hydration to disagree about — and a version tab draws
  // no pill while the answer is outstanding, which is why this is three-valued
  // rather than a boolean defaulting to false: a pill that appears and then
  // vanishes reads as a fault, and one that appears late reads as loading.
  const [editable, setEditable] = useState<boolean | null>(null);
  // Somebody has changed something in the document since it loaded, or since
  // the last successful save. The frame reports it; nothing out here can see
  // into an opaque origin.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = document.getElementById(WORKSHEET_FRAME_ID);
      if (!(frame instanceof HTMLIFrameElement)) return;
      // The frame is the only window that may answer, and it has an opaque
      // origin — so this checks the SOURCE, exactly as SaveVersionButton does.
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; editable?: boolean } | null;
      if (!data) return;
      if (data.type === EDITABLE_MESSAGE) setEditable(Boolean(data.editable));
      // Idempotent, which is what lets the frame report every change rather
      // than only the first.
      if (data.type === DIRTY_MESSAGE) setDirty(true);
    }

    window.addEventListener("message", onMessage);

    // ASKED HERE AS WELL AS ON THE IFRAME'S onLoad, and both are needed.
    //
    // The version tabs and the back control are plain anchors, so moving
    // between versions is a full document load — and on a full load the frame
    // can finish loading BEFORE React hydrates and attaches onLoad, which
    // React does not replay. The probe was then never sent, no answer ever
    // came, and the Save pill never appeared on a saved version. Arriving
    // from the shelf chooser hid it: that is a next/link navigation, so the
    // handler is attached before the frame starts loading and the event is
    // caught. Same URL, same document, opposite outcome — which is exactly how
    // it read as "it works if I go straight there".
    //
    // This covers the frame that is ALREADY loaded; onLoad covers the frame
    // that is not yet. A post to a frame still showing about:blank is
    // harmless: nothing is listening in it, and onLoad follows.
    const frame = document.getElementById(WORKSHEET_FRAME_ID);
    if (frame instanceof HTMLIFrameElement) {
      frame.contentWindow?.postMessage(EDITABLE_MESSAGE, "*");
    }

    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Where the pill may be drawn at all. Jenn on every version, a student on
  // the blank and their own answers — see lib/worksheet-save-slots.ts for why
  // the two are not symmetric. The probe narrows it further on a saved
  // version: a document whose answers were click-driven comes back inert, and
  // a control that can never enable is worse than no control.
  const canSave =
    canSaveFromSlot(slot, audience) && (slot === "blank" || editable === true);

  // The browser's own leave prompt, armed only while there is something to
  // lose. Gated on `canSave` as well as on `dirty` deliberately: prompting
  // about typing the reader has no way to save is a dead end, and the two
  // conditions are the same question asked twice — "is there work here worth
  // keeping?"
  //
  // beforeunload covers the version tabs, the back control and closing the
  // tab, because every one of those is a real document navigation: the tabs
  // and the back link are plain anchors, not next/link. It does NOT cover
  // browser Back, which is the same accepted gap the whiteboard's leave-guard
  // records — beforeunload does not fire for an App Router popstate.
  useEffect(() => {
    if (!dirty || !canSave) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      // Both, because browsers disagree about which one arms the dialog, and
      // no browser lets the wording be chosen.
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, canSave]);

  return (
    <>
      <nav
        aria-label={audience === "teacher" ? "Versions" : "Versions du devoir"}
        // Three tracks rather than a centred row with the back control laid
        // over it. The two `1fr` edges are equal, so the strip is centred on
        // the VIEWPORT and not on the space left over — but they are `1fr`
        // and not `minmax(0,1fr)`, so neither can shrink below its content
        // and let the control overlap the tabs. The strip absorbs the
        // shortfall instead, by scrolling: three French labels are wider than
        // a phone, and a control painted over "La correction de Jenn" is the
        // same collision as the two pills below.
        //
        // Back sits in the FIRST track. Leaving is a backwards move and the
        // reading order should meet it first — and on the shelf this returns
        // to, the tile it came from is at the top left.
        className="fixed inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 pt-4 print:hidden"
      >
        <div className="flex justify-start">
          <a
            href={`/g/${groupSlug}?tab=files`}
            aria-label={
              audience === "teacher" ? "Back to files" : "Les fichiers"
            }
            // One target for both audiences, not a referrer sniff: this is
            // where the tile that opened the worksheet lives, for a student
            // and for an unlocked teacher alike — she has no card tab and
            // lands on Files too (see CLAUDE.md's /g/[slug] route notes).
            // Reading Referer or history would be a guess, and a wrong guess
            // strands whoever pressed it on a page with no way back.
            //
            // A plain anchor for the same reason the version tabs beside it
            // are: the leave-guard inspects real anchors on the document.
            className={cn(
              "flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] motion-reduce:transition-none",
              cardFocusRing,
            )}
          >
            <BackIcon />
            <span className="hidden whitespace-nowrap sm:inline">
              {audience === "teacher" ? "Back to files" : "Les fichiers"}
            </span>
          </a>
        </div>
        <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1 shadow-[var(--card-shadow)]">
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
        {/* Empty, and load-bearing: it is the track that mirrors the back
            control's, which is what keeps the strip centred on the viewport
            rather than on the room the control left over. */}
        <div />
      </nav>
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
        {/* Drawn per canSave above, and DISABLED until the document reports a
            change. An enabled Save over an untouched worksheet promises work
            that does not exist, and pressing it writes the slot with what is
            already in it — which, on a student's own answers, costs a version
            of their homework to say nothing new.
            The route is untouched and still writes the caller's own slot from
            whatever view called it, so this withholds a control and adds no
            access rule. */}
        {canSave && (
          <SaveVersionButton
            className="static"
            groupSlug={groupSlug}
            pageSlug={pageSlug}
            audience={audience}
            disabled={!dirty}
            // Clears the flag, which both greys the pill again and disarms the
            // leave prompt. The frame reports every subsequent change, so a
            // second edit re-arms both.
            onSaved={() => setDirty(false)}
          />
        )}
      </div>
    </>
  );
}

// A left-pointing arrow, matching the admin's back-arrow glyphs elsewhere in
// the app rather than introducing a new icon style for one control.
function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}
