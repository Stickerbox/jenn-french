"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { AddMenu } from "@/components/ui/AddMenu";
import { AddSheet } from "@/components/ui/AddSheet";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { renderPdfThumbnail } from "@/components/pdf-thumbnail";
import { MAX_PDF_BYTES } from "@/lib/page-pdf";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";

type Open = null | "menu" | "link" | "page" | "pdf";

// The render starts at stagePdf, while a student is still reading the title
// field — so this is a grace period, not the render's budget (that is
// renderPdfThumbnail's own RENDER_TIMEOUT_MS). Bounded, unlike NewPageForm's
// wait: on the connection slow enough to need this, pressing Enregistrer
// should not become a second wait on top of the upload. Whatever this misses
// is not lost, only deferred — ThumbBackfill's renderAndStorePdfThumbnail
// picks up any pdf row still missing a preview on Jenn's next Pages tab visit.
const THUMB_WAIT_MS = 3_000;

export type ShelfRole = "student" | "teacher";

// Two label sets, chosen by role, following the split this codebase keeps
// everywhere: Jenn's UI is English and a student's is French.
//
// The student has no "add a page". Uploading a whole HTML document is Jenn's
// again — "they can only upload a PDF, not a website" — and this is where that
// narrowing happens. addShelfPage stays on the server with its guard and its
// tests intact, because the guard is correct and what changed is which control
// is drawn.
//
// "Add a student" is deliberately absent from Jenn's menu: creating a student
// is an admin-level act and has no meaning inside one student's page.
const LABELS = {
  student: {
    add: "Ajouter",
    link: "Ajouter un lien",
    pdf: "Ajouter un PDF",
  },
  teacher: {
    add: "Add",
    link: "Add a link",
    page: "Add a page",
    pdf: "Add a PDF",
  },
} as const;

// The shelf's one add control, replacing the row of fields that used to sit
// above the files list. It renders on EVERY tab, not just Files: it matches the
// chat button, which is already page-level, and a control that appears and
// disappears as you move between tabs reads as a bug next to one that never
// does.
//
// It sits to the LEFT of the chat button rather than above it. Above is where
// the chat panel lives (ChatWindow's bottom-24 right-4), so a stacked button
// would sit behind an open conversation. Side by side, neither ever covers the
// other and neither has to move.
//
// It renders inside StreamProvider because that is the branch `unlocked`
// already selects — not because it needs the stream. It must never call
// useStream.
export function ShelfFab({
  role,
  onAddLink,
  onAddPage,
  onAddPdf,
}: {
  role: ShelfRole;
  onAddLink: (input: { url: string }) => Promise<void>;
  // Optional, and the optionality is the feature: a student's menu does not
  // offer it, so a student page has nothing to pass.
  onAddPage?: (input: { html: string }) => Promise<void>;
  onAddPdf: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The staged PDF, and null until one is chosen. Staging is not submitting —
  // the same flow NewPageForm uses, so a title can be seen before it is sent.
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  // The in-flight preview render. A ref so submit can AWAIT it rather than race
  // a boolean: staging a file and pressing Save at once would otherwise drop
  // the preview silently. NewPageForm records the same reasoning.
  const thumbJob = useRef<Promise<Blob | null> | null>(null);

  function done() {
    setOpen(null);
    setUrl("");
    setError(null);
    setPdfFile(null);
    setPdfTitle("");
    setTitleTouched(false);
    thumbJob.current = null;
    // The shelf is server-rendered, so a refresh is what makes the new row
    // appear rather than a local insert that could disagree with it.
    router.push("?tab=files");
    router.refresh();
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAddLink({ url });
      done();
    } catch {
      // The action's own messages are English and written for Jenn; a student
      // gets one French sentence instead of a leaked internal string.
      setError("Ce lien n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  // The paste IS the submit: there is no Save button, because there is nothing
  // else on this form to fill in.
  async function submitPage(html: string) {
    if (!onAddPage) return;
    setSaving(true);
    setError(null);
    try {
      await onAddPage({ html });
      done();
    } catch {
      setError("Cette page n'a pas pu être ajoutée.");
    } finally {
      setSaving(false);
    }
  }

  // Stages the file and NOTHING else, exactly as NewPageForm does: the title
  // has to be visible and editable before anything is sent.
  function stagePdf(file: File) {
    setError(null);
    // Checked again on the server, which is the authority. Telling them before
    // a 3 MB upload rather than after — and in French, like every other message
    // a student can reach.
    if (file.size > MAX_PDF_BYTES) {
      setError("Ce PDF dépasse 3 Mo.");
      return;
    }

    setPdfFile(file);
    if (!titleTouched) setPdfTitle(file.name.replace(/\.pdf$/i, ""));

    // Started on stage rather than at submit so it renders WHILE they read the
    // title field. On a phone this is also when pdf.js is fetched, once.
    thumbJob.current = renderPdfThumbnail(file);
  }

  async function submitPdf(event: FormEvent) {
    event.preventDefault();
    if (!pdfFile) return;

    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("title", pdfTitle);
      formData.set("pdf", pdfFile);
      // Raced against a short timer rather than awaited unbounded: on the
      // connection that motivated this, the render itself can take longer than
      // a student will wait on a save they already pressed. THUMB_WAIT_MS is
      // the grace period, not the render's own budget; a slow render that
      // loses the race still finishes, but nothing here is listening for it —
      // the upload proceeds without a thumbnail and ThumbBackfill catches it
      // later. NewPageForm keeps its unbounded await: Jenn uploads from a
      // desktop, where this race would only ever fire pointlessly.
      const rendered = thumbJob.current
        ? await Promise.race([
            thumbJob.current,
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), THUMB_WAIT_MS),
            ),
          ])
        : null;
      if (rendered) formData.set("thumb", rendered, "thumb.jpg");
      // No audience: the action is curried on the group id, so the shelf is
      // whichever page this FAB is on.
      await onAddPdf(formData);
      done();
    } catch {
      setError("Ce PDF n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  const labels = LABELS[role];
  const choices =
    role === "teacher"
      ? [
          { key: "link", label: LABELS.teacher.link },
          { key: "page", label: LABELS.teacher.page },
          { key: "pdf", label: LABELS.teacher.pdf },
        ]
      : [
          { key: "link", label: LABELS.student.link },
          { key: "pdf", label: LABELS.student.pdf },
        ];

  return (
    <>
      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={choices}
          onChoose={(key) => setOpen(key as Open)}
          onDismiss={() => setOpen(null)}
        />
      )}

      {open === "link" && (
        <AddSheet
          title={labels.link}
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <form onSubmit={submitLink} className="flex flex-col gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Adresse du lien"
              required
              autoFocus
              className={cn(fieldClassName, "mt-0")}
            />
            {/* One field: the name is taken from the address itself. */}
            <button
              type="submit"
              disabled={saving || url.trim() === ""}
              className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
            >
              {saving ? "Ajout…" : "Enregistrer"}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      {open === "page" && onAddPage && (
        <AddSheet
          title={LABELS.teacher.page}
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <HtmlPasteBox
            tone="card"
            labels={{
              prompt: "Collez le code HTML ici (⌘V)",
              accepted: (size) => `Page reçue — ${size}`,
              ariaLabel: "Code HTML de la page",
            }}
            onHtml={submitPage}
            errorFor={() => "Ce n'est pas une page HTML."}
          />
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-[var(--card-rouge)]">
              {error}
            </p>
          )}
        </AddSheet>
      )}

      {open === "pdf" && (
        <AddSheet
          title={labels.pdf}
          closeLabel={role === "teacher" ? "Close" : "Fermer"}
          onClose={() => setOpen(null)}
        >
          <form onSubmit={submitPdf} className="flex flex-col gap-3">
            {/* A PDF cannot be pasted, so this is the one staging control that
                is still a file input. The zone hands the File up unread and
                enforces no cap of its own — the caps differ by kind and it does
                not decide kind. */}
            <FileDropZone
              fileName={pdfFile?.name ?? null}
              fileSize={pdfFile?.size ?? null}
              hasExisting={false}
              accept="application/pdf"
              inputLabel={role === "teacher" ? "Choose a PDF" : "Choisir un PDF"}
              emptyHint={
                role === "teacher"
                  ? "PDF, up to 3 MB"
                  : "PDF, 3 Mo maximum"
              }
              existingHint=""
              onFile={stagePdf}
            />

            {pdfFile && (
              <input
                value={pdfTitle}
                onChange={(e) => {
                  setTitleTouched(true);
                  setPdfTitle(e.target.value);
                }}
                aria-label={role === "teacher" ? "Title" : "Titre du document"}
                required
                className={cn(fieldClassName, "mt-0")}
              />
            )}

            <button
              type="submit"
              disabled={saving || !pdfFile || pdfTitle.trim() === ""}
              className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
            >
              {saving
                ? role === "teacher"
                  ? "Saving…"
                  : "Ajout…"
                : role === "teacher"
                  ? "Save"
                  : "Enregistrer"}
            </button>

            {error && (
              <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      <Fab
        label={labels.add}
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        className="bottom-6 right-24"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Fab>
    </>
  );
}
