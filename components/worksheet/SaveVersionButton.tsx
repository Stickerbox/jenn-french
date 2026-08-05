"use client";

import { useState } from "react";
import { SNAPSHOT_MESSAGE } from "@/lib/printable-bootstrap";

export const WORKSHEET_FRAME_ID = "worksheet-document";

type State = "idle" | "saving" | "saved" | "error";

// A silent failure here loses a student's homework, which is why this reports
// every state and why nothing navigates on save: a student whose network
// dropped still has every answer in the DOM and can press it again.
//
// This INVERTS captureHtmlThumbnail's contract deliberately. That one answers
// null on failure because a missing preview leaves a working iframe in place.
const TIMEOUT_MS = 10_000;

export function SaveVersionButton({
  groupSlug,
  pageSlug,
  audience,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const frame = document.getElementById(WORKSHEET_FRAME_ID);
    if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow) return;
    // Captured into its own const, non-nullable: TS narrows `frame` at this
    // line but does not carry that narrowing into the nested closures below,
    // which run later and could in principle see a different `frame`.
    const contentWindow = frame.contentWindow;

    setState("saving");
    setMessage(null);

    const html = await new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);

      function finish(value: string | null) {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(value);
      }

      function onMessage(event: MessageEvent) {
        // The frame is the only window that may answer, and it has an opaque
        // origin — so this checks the SOURCE, as the listener inside it does.
        if (event.source !== contentWindow) return;
        const data = event.data as
          | { type?: string; ok?: boolean; html?: string }
          | null;
        if (!data || data.type !== SNAPSHOT_MESSAGE) return;
        finish(data.ok && typeof data.html === "string" ? data.html : null);
      }

      window.addEventListener("message", onMessage);
      // "*" because the frame's origin is opaque — there is no origin string
      // that would match it. The listener authenticates us from the other side.
      contentWindow.postMessage(SNAPSHOT_MESSAGE, "*");
    });

    if (html === null) {
      setState("error");
      setMessage(
        audience === "teacher"
          ? "That didn't save. Try again."
          : "L'enregistrement a échoué. Essaie encore.",
      );
      return;
    }

    const response = await fetch(`/api/worksheets/${groupSlug}/${pageSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });

    if (!response.ok) {
      setState("error");
      setMessage(await response.text());
      return;
    }

    setState("saved");
  }

  const label =
    audience === "teacher"
      ? { idle: "Save correction", saving: "Saving…", saved: "Saved" }
      : {
          idle: "Enregistrer mes réponses",
          saving: "Enregistrement…",
          saved: "Enregistré",
        };

  return (
    <div className="fixed bottom-5 right-5 z-10 flex flex-col items-end gap-2 print:hidden">
      {message && (
        <p className="max-w-xs rounded-lg bg-white px-3 py-2 text-sm text-[var(--card-rouge)] shadow-[var(--card-shadow)]">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="flex items-center gap-2 rounded-full bg-[var(--card-rouge)] px-5 py-3 font-[family-name:var(--card-font-serif)] text-sm text-white shadow-[var(--card-shadow)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "saving" ? label.saving : state === "saved" ? label.saved : label.idle}
      </button>
    </div>
  );
}
