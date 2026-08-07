"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIRTY_MESSAGE, EDITABLE_MESSAGE } from "@/lib/printable-bootstrap";
import { requestSnapshot, worksheetFrame } from "@/components/worksheet/frame";

// Ten seconds is a compromise, not a measurement: short enough that a closed
// laptop loses one sentence, long enough that a paragraph costs one write
// rather than forty. A write is the WHOLE DOM — 40-70 KB after brotli — so it
// is not free.
export const DEBOUNCE_MS = 10_000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Every fact about "is there work here worth keeping", in one place, because
// they are one question asked three ways: the pill's state, the leave prompt,
// and whether the timer should be running.
export function useWorksheetAutosave({
  groupSlug,
  pageSlug,
  audience,
  writable,
  onSaved,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  // isWritableSlot's answer for the tab being shown. A read-only tab still
  // types — text fields are browser behaviour, and stopping them would mean
  // rewriting the served document — so this gates the WRITE, not the typing.
  writable: boolean;
  // Told after a write lands, never before. The shell adds the new tab and
  // moves the address on the first one.
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  // null until the document has answered, and null on the server too, so there
  // is nothing for hydration to disagree about.
  const [editable, setEditable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  // Read inside the debounce callback, which is created once. A state value
  // read there would be the value from the render that created it. Synced in
  // an effect rather than assigned during render — react-hooks/refs treats a
  // render-time ref write as unsafe under concurrent rendering, even though
  // this hook has only one render path.
  const writableRef = useRef(writable);
  useEffect(() => {
    writableRef.current = writable;
  });
  const savingRef = useRef(false);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setStatus("saving");
    setError(null);

    const html = await requestSnapshot();
    const failed =
      audience === "teacher"
        ? "That didn't save. Try again."
        : "L'enregistrement a échoué. Essaie encore.";

    if (html === null) {
      savingRef.current = false;
      setStatus("error");
      setError(failed);
      return false;
    }

    let response: Response;
    try {
      response = await fetch(`/api/worksheets/${groupSlug}/${pageSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
    } catch {
      // fetch REJECTS rather than answering `ok: false` on a genuine network
      // failure — offline, DNS, a dropped connection — which a phone hits
      // often. Left unguarded this stranded `status` at "saving" forever:
      // savingRef never cleared, so every later keystroke's debounce found
      // a save already "in flight" and did nothing, silently, for the rest
      // of the session. Handled on the same path as `!response.ok` below,
      // and NOT rescheduled for the same reason: only a reported change may
      // schedule a write.
      savingRef.current = false;
      setStatus("error");
      setError(failed);
      return false;
    }

    savingRef.current = false;

    if (!response.ok) {
      // The route's own text is English and written for whoever is debugging
      // it. Jenn reads English, so her side keeps the specific reason; a
      // student gets one sentence instead of a leaked server string.
      const reason = await response.text();
      setStatus("error");
      setError(audience === "teacher" ? reason : failed);
      // Deliberately NOT rescheduled. Only a change schedules a write, so a
      // document too large to store fails once and then waits, instead of
      // failing every ten seconds for as long as the tab is open.
      return false;
    }

    setStatus("saved");
    setDirty(false);
    onSaved();
    return true;
  }, [audience, groupSlug, pageSlug, onSaved]);

  // Every change the document reports, and the probe's answer. The frame is
  // the only window that may speak, and it has an opaque origin, so this
  // checks the SOURCE.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = worksheetFrame();
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; editable?: boolean } | null;
      if (!data) return;

      if (data.type === EDITABLE_MESSAGE) setEditable(Boolean(data.editable));

      if (data.type === DIRTY_MESSAGE) {
        // A read-only tab still types — text fields are browser behaviour,
        // and stopping them would mean rewriting the served document — but
        // nothing typed there is stored, so it is not "dirty" in the sense
        // this flag means everywhere it's read. Setting it anyway used to
        // flip an already-`"sent"` send state back to `"ready"` from a stray
        // keystroke on Jenn's correction or a student's read of it, and
        // pressing Send then posted a second notice with nothing new behind
        // it — flush() rightly writes nothing on a read-only tab, but the
        // route it calls next has no way to know that.
        if (!writableRef.current) return;
        setDirty(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        // Restarted on every change, so a run of typing costs one write and
        // the ten seconds are counted from the LAST key, not the first.
        timer.current = window.setTimeout(() => {
          timer.current = null;
          void save();
        }, DEBOUNCE_MS);
      }
    }

    window.addEventListener("message", onMessage);

    // ASKED HERE AS WELL AS ON THE IFRAME'S onLoad, and both are needed. The
    // version tabs and the back control are plain anchors, so moving between
    // versions is a full document load — and on a full load the frame can
    // finish loading BEFORE React hydrates and attaches onLoad, which React
    // does not replay. Arriving from the shelf chooser hides it: that is a
    // next/link navigation, so the handler is attached first. Same URL, same
    // document, opposite outcome.
    worksheetFrame()?.contentWindow?.postMessage(EDITABLE_MESSAGE, "*");

    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [save]);

  // Write now, if there is anything outstanding. Send calls this before it
  // announces anything: a notice about work that was never stored is worse
  // than a late notice.
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty || !writable) return true;
    return save();
  }, [dirty, writable, save]);

  return { status, dirty, editable, error, flush };
}
