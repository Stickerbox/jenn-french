"use client";

import { useState } from "react";
import type { SendState } from "@/lib/worksheet-send";
import { firstNameOf } from "@/lib/student-greeting";

// A notice and nothing else. Every save has already happened by the time this
// is pressed — which is exactly what makes it pressable without fear, and what
// the old Save pill could never be.
export function SendVersionButton({
  groupSlug,
  pageSlug,
  audience,
  studentName,
  state,
  flush,
  onSent,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
  studentName: string;
  state: SendState;
  // Writes anything the debounce still holds. Awaited before the notice goes,
  // so the message can never announce work that was never stored.
  flush: () => Promise<boolean>;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);

    const written = await flush();
    if (!written) {
      setBusy(false);
      // The hook is already showing its own reason for the failed write. This
      // says only that the notice did not go, which is the part the pill owns.
      setError(
        audience === "teacher"
          ? "Save that first — it didn't go."
          : "Enregistrement impossible. Rien n'a été envoyé.",
      );
      return;
    }

    let response: Response;
    try {
      response = await fetch(
        `/api/worksheets/${groupSlug}/${pageSlug}/send`,
        { method: "POST" },
      );
    } catch {
      // fetch REJECTS rather than answering `ok: false` on a genuine network
      // failure — offline, DNS, a dropped connection — a case a phone hits
      // often. Left unguarded the exception escaped this handler entirely,
      // busy never cleared, and the button sat disabled with no message
      // until a reload. Handled the same way a non-ok response already is.
      setBusy(false);
      setError(
        audience === "teacher"
          ? "That didn't go. Try again."
          : "L'envoi a échoué. Essaie encore.",
      );
      return;
    }
    setBusy(false);

    if (!response.ok) {
      setError(
        audience === "teacher"
          ? await response.text()
          : "L'envoi a échoué. Essaie encore.",
      );
      return;
    }

    // After the write landed, never before — the ordering createMessage and
    // addChatLinks both keep.
    onSent();
  }

  // The whole name for Jenn, the rule versionLabel already keeps: two students
  // can share a first name. The student's own button names Jenn, of whom there
  // is exactly one.
  const label =
    audience === "teacher"
      ? `Send to ${firstNameOf(studentName) ?? studentName}`
      : "Envoyer à Jenn";
  const doneLabel = audience === "teacher" ? "Sent" : "Envoyé";
  const busyLabel = audience === "teacher" ? "Sending…" : "Envoi…";

  const disabled = state !== "ready" || busy;
  const why =
    state === "empty"
      ? audience === "teacher"
        ? "Nothing saved to send yet"
        : "Il n'y a rien à envoyer pour le moment"
      : state === "sent"
        ? audience === "teacher"
          ? "Already sent — change something to send again"
          : "Déjà envoyé — modifie quelque chose pour renvoyer"
        : undefined;

  return (
    <>
      {error && (
        <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        // The title carries what a greyed-out control cannot say by itself.
        // There is no hover on a phone, which is why the state is also in the
        // label: "Envoyé" says the press worked, where a vanished button
        // would say nothing at all.
        title={why}
        className="flex items-center gap-2 rounded-full bg-[var(--card-rouge)] px-5 py-3 font-[family-name:var(--card-font-serif)] text-sm text-white shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 motion-reduce:transition-none disabled:opacity-60"
      >
        {busy ? busyLabel : state === "sent" ? doneLabel : label}
      </button>
    </>
  );
}
