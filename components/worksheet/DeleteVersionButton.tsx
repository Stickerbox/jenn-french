"use client";

import { useState } from "react";

// One control, two names, one rule: it deletes the caller's OWN row.
//
// To a student it is the way out of an inert worksheet — a Dia document
// answered by clicking comes back with its scripts stripped and nothing left
// to click, and under one tab there is no blank to go back to.
//
// To Jenn it is the only thing that makes her read-only tabs writable again.
// One stray keystroke on the blank creates a correction and locks the other
// two, so this is drawn on ALL THREE of her tabs — a control that unlocks them
// is useless if it is only on the tab she must first know to open.
export function DeleteVersionButton({
  groupSlug,
  pageSlug,
  audience,
  cancel,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  // Discards any pending debounce before the row it would have written is
  // gone. Called only after the confirm, not before: cancelling first would
  // clear `dirty` for a press the user then declines, leaving unsaved work
  // marked clean with no timer left to catch it and no warning if they then
  // navigate away.
  cancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    // There is no version history behind this. The row is gone, so it asks.
    const question =
      audience === "teacher"
        ? "Delete your correction? This cannot be undone."
        : "Recommencer ce devoir ? Tes réponses seront effacées.";
    if (!window.confirm(question)) return;

    // A confirmed delete IS abandoning whatever the timer was about to
    // write — the normal case for this button, not an edge one: typing,
    // then deciding to start over, is exactly when a debounce is most
    // likely to still be pending. Without this a save queued behind the
    // confirm dialog's block on the main thread could land after the
    // restart route's delete and recreate the row the user just discarded.
    cancel();

    setBusy(true);
    let response: Response;
    try {
      response = await fetch(
        `/api/worksheets/${groupSlug}/${pageSlug}/restart`,
        { method: "POST" },
      );
    } catch {
      // fetch REJECTS rather than answering `ok: false` on a genuine network
      // failure — offline, DNS, a dropped connection. Left unguarded the
      // exception escaped this handler, busy never cleared, and the button
      // sat disabled with no way to press it again until a reload. Handled
      // on the same path as a non-ok response below: nothing was deleted,
      // so there is nothing to navigate to.
      setBusy(false);
      return;
    }
    if (!response.ok) {
      setBusy(false);
      return;
    }

    // A full navigation with no ?v=, rather than a reload: the tab that was
    // open no longer exists, and the page picks each party's correct default
    // for itself. A reload would land on a deleted slot.
    window.location.href = `/g/${groupSlug}/w/${pageSlug}`;
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 motion-reduce:transition-none disabled:opacity-60"
    >
      {audience === "teacher" ? "Delete correction" : "Recommencer"}
    </button>
  );
}
