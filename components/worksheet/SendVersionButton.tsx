"use client";

import { useState } from "react";
import type { SendState } from "@/lib/worksheet-send";
import { firstNameOf } from "@/lib/student-greeting";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

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
  locale,
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
  // The LOCALE, never a resolved Strings object — see lib/strings.ts on why
  // that boundary is the thing that breaks.
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = getStrings(locale).worksheet.send;

  async function send() {
    setBusy(true);
    setError(null);

    const written = await flush();
    if (!written) {
      setBusy(false);
      // The hook is already showing its own reason for the failed write. This
      // says only that the notice did not go, which is the part the pill owns.
      setError(t.notSaved);
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
      setError(t.failed);
      return;
    }
    setBusy(false);

    if (!response.ok) {
      // The route's own text is English and written for whoever is debugging
      // it. Jenn gets it verbatim because she is the operator of this site,
      // not because of which language she reads — that is a ROLE split, and
      // it is the one thing on this screen still keyed to `audience` rather
      // than to the browser. A student gets the translated sentence instead
      // of a leaked server string.
      setError(audience === "teacher" ? await response.text() : t.failed);
      return;
    }

    // After the write landed, never before — the ordering createMessage and
    // addChatLinks both keep.
    onSent();
  }

  // `audience` here is PERSPECTIVE — who this notice goes TO — not language.
  // Jenn's button names the student, the student's names Jenn, and both
  // sentences come out of the dictionary the browser asked for.
  //
  // The first name only, the rule firstNameOf already draws for greeting():
  // "Send to Marie Dupont" reads like a form, not a button.
  const label =
    audience === "teacher"
      ? t.toStudent(firstNameOf(studentName) ?? studentName)
      : t.toTeacher;

  const disabled = state !== "ready" || busy;
  const why =
    state === "empty" ? t.nothingYet : state === "sent" ? t.alreadySent : undefined;

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
        {busy ? t.sending : state === "sent" ? t.sent : label}
      </button>
    </>
  );
}
