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
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    // There is no version history behind this. The row is gone, so it asks.
    const question =
      audience === "teacher"
        ? "Delete your correction? This cannot be undone."
        : "Recommencer ce devoir ? Tes réponses seront effacées.";
    if (!window.confirm(question)) return;

    setBusy(true);
    const response = await fetch(
      `/api/worksheets/${groupSlug}/${pageSlug}/restart`,
      { method: "POST" },
    );
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
