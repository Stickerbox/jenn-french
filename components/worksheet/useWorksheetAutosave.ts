"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIRTY_MESSAGE, EDITABLE_MESSAGE } from "@/lib/printable-bootstrap";
import { requestSnapshot, worksheetFrame } from "@/components/worksheet/frame";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

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
  locale,
  onSaved,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  // isWritableSlot's answer for the tab being shown. A read-only tab still
  // types — text fields are browser behaviour, and stopping them would mean
  // rewriting the served document — so this gates the WRITE, not the typing.
  writable: boolean;
  // The LOCALE, never a resolved Strings object — see lib/strings.ts.
  locale: Locale;
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
  // Mirrors `dirty` for the same reason `writableRef` mirrors the prop: an
  // async callback (flush's post-await continuation, cancel()) needs the
  // CURRENT answer, not the one closed over when that callback was created.
  // Assigned right beside every `setDirty` call rather than synced in an
  // effect, because both writes are already synchronous with the state
  // change — an effect would only add a render's worth of lag for no
  // benefit here.
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  // The currently in-flight save, if any — set by whoever actually starts
  // one (the debounce timer), read by flush() so a Send press that lands
  // mid-save can wait on the SAME request instead of starting a second one
  // that save()'s own reentrancy guard would just refuse.
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setStatus("saving");
    setError(null);

    const html = await requestSnapshot();
    const failed = getStrings(locale).worksheet.saveFailed;

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
      // The route's own text is English and written for whoever is debugging
      // it. Jenn gets it verbatim because she is this site's OPERATOR — a
      // role split, not a language one, and the only thing here still keyed
      // to `audience`. A student gets the translated sentence rather than a
      // leaked server string.
      const reason = await response.text();
      setStatus("error");
      setError(audience === "teacher" ? reason : failed);
      // Deliberately NOT rescheduled. Only a change schedules a write, so a
      // document too large to store fails once and then waits, instead of
      // failing every ten seconds for as long as the tab is open.
      return false;
    }

    setStatus("saved");
    dirtyRef.current = false;
    setDirty(false);
    onSaved();
    return true;
  }, [audience, groupSlug, pageSlug, locale, onSaved]);

  // Read inside the debounce callback instead of closing over `save`
  // directly. `save`'s identity changes when `onSaved`'s does — which
  // happens once, on the first successful save, when the shell's `ownExists`
  // flips — and the listener effect below used to depend on `[save]`. A
  // React effect dependency change tears the OLD effect down before setting
  // the new one up, and the cleanup clears `timer.current` — even a timer
  // just armed by a keystroke typed during that first save's network round
  // trip, moments before `onSaved()` fired. `dirty` stayed true with nothing
  // left to ever clear it but another keystroke or an explicit Send. Kept
  // current every render, the same shape as `writableRef` above.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

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
        dirtyRef.current = true;
        setDirty(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        // Restarted on every change, so a run of typing costs one write and
        // the ten seconds are counted from the LAST key, not the first.
        timer.current = window.setTimeout(() => {
          timer.current = null;
          const promise = saveRef.current();
          savePromiseRef.current = promise;
          void promise.finally(() => {
            if (savePromiseRef.current === promise) savePromiseRef.current = null;
          });
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
    // Mounts once and cleans up only on unmount — see saveRef above. Every
    // other value this effect reads (writableRef, dirtyRef, savePromiseRef)
    // is a ref precisely so it does not belong in this array either.
  }, []);

  // Discards the pending debounce without saving, and clears `dirty` to
  // match — both, because a confirmed delete means abandoning whatever the
  // timer was about to write, and the shell arms `beforeunload` on `dirty`,
  // so leaving it set would raise a "you have unsaved changes" dialog on the
  // very navigation the delete triggers. Does NOT touch a save already in
  // flight: that request cannot be unsent, so the arriving write and the
  // delete's own row-clear simply race, and the delete is the one this
  // control exists to make final.
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  // Write now, if there is anything outstanding. Send calls this before it
  // announces anything: a notice about work that was never stored is worse
  // than a late notice.
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    if (savingRef.current && savePromiseRef.current) {
      // A debounce-triggered save can already be in flight for the very
      // dirty state this call was about to write. save()'s own reentrancy
      // guard would answer `false` to a second call made right now — a
      // false failure, reported to the user as "it didn't go" moments
      // before the real write lands. Awaiting the SAME promise instead can
      // only succeed together with it.
      await savePromiseRef.current;
      // That save may predate keystrokes typed while it was in the air, so
      // dirtiness is checked again here — through the refs, not `dirty`,
      // which this callback's closure captured before the await and which
      // an intervening DIRTY_MESSAGE would have made stale. Same class of
      // staleness saveRef exists to prevent above.
      if (dirtyRef.current && writableRef.current) return save();
      return true;
    }

    if (!dirtyRef.current || !writableRef.current) return true;
    return save();
  }, [save]);

  return { status, dirty, editable, error, flush, cancel };
}
