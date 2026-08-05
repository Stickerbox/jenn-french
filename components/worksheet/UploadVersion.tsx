"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { validatePagePdf } from "@/lib/page-pdf";

type State = "idle" | "saving" | "saved" | "error";

// The chooser's only control for a pdf worksheet: choosing the file IS the
// submit, the same one-gesture flow NewPageForm already uses for a PDF upload,
// because FileDropZone hands the File up unread and there is nothing else on
// this form to fill in.
//
// validatePagePdf runs here BEFORE the request, so a wrong file is a sentence
// rather than a round trip to the server and back — the server checks it again
// as the authority, the same split the shelf's own PDF upload keeps.
export function UploadVersion({
  groupSlug,
  pageSlug,
  audience,
}: {
  groupSlug: string;
  pageSlug: string;
  audience: "student" | "teacher";
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // validatePagePdf and the route both answer in English, written for
  // whoever reads a stack trace, not for a student — Jenn keeps the specific
  // reason (she reads English), and a student gets this one sentence instead
  // of "That PDF is larger than 3 MB." leaking through untranslated. The same
  // split ShelfFab's stagePdf/submitPdf already make for the shelf's own PDF
  // upload.
  const studentUploadError = "Ce PDF n'a pas pu être téléversé.";

  async function handleFile(file: File) {
    setFileName(file.name);

    const checked = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) {
      setState("error");
      setMessage(audience === "teacher" ? checked.error : studentUploadError);
      return;
    }

    setState("saving");
    setMessage(null);

    const form = new FormData();
    form.set("pdf", file);

    const response = await fetch(`/api/worksheets/${groupSlug}/${pageSlug}`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const reason = await response.text();
      setState("error");
      setMessage(audience === "teacher" ? reason : studentUploadError);
      return;
    }

    setState("saved");
    // The chooser's own version rows come from a server-rendered list, not
    // client state — this is what makes the new one appear without closing
    // the dialog to reopen it.
    router.refresh();
  }

  const label =
    audience === "teacher" ? "Upload my correction" : "Téléverser mes réponses";
  const savingLabel = audience === "teacher" ? "Uploading…" : "Téléversement…";
  const savedLabel = audience === "teacher" ? "Uploaded" : "Téléversé";

  return (
    <div className="mt-3 border-t border-[var(--card-line)] pt-3">
      <FileDropZone
        fileName={state === "saving" || state === "saved" ? fileName : null}
        fileSize={null}
        hasExisting={false}
        accept="application/pdf"
        inputLabel={label}
        emptyHint={label}
        existingHint={label}
        onFile={handleFile}
      />
      {state === "saving" && (
        <p className="mt-1 text-center text-xs text-[var(--color-ink-muted)]">
          {savingLabel}
        </p>
      )}
      {state === "saved" && (
        <p className="mt-1 text-center text-xs text-[var(--card-moss)]">
          {savedLabel}
        </p>
      )}
      {message && (
        <p className="mt-1 text-center text-xs text-[var(--card-rouge)]">
          {message}
        </p>
      )}
    </div>
  );
}
