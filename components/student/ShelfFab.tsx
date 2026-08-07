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
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing, formErrorText } from "@/components/card-styles";
import { AddFlashcardForm } from "@/components/student/AddFlashcardForm";

type Open = null | "menu" | "link" | "page" | "pdf" | "card";

// The Save button on each of the three sheets below — link, page, PDF — was
// three copies of the same string. min-h-[44px] added on top of its existing
// py-2.5 makes the tap target's floor explicit rather than trusting the text
// size and padding to add up to it.
const shelfSubmitButton = cn(
  "min-h-[44px] rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none disabled:opacity-50",
  cardFocusRing,
);

// The render starts at stagePdf, while a student is still reading the title
// field — so this is a grace period, not the render's budget (that is
// renderPdfThumbnail's own RENDER_TIMEOUT_MS). Bounded, unlike NewPageForm's
// wait: on the connection slow enough to need this, pressing Enregistrer
// should not become a second wait on top of the upload. Whatever this misses
// is not lost, only deferred — ThumbBackfill's renderAndStorePdfThumbnail
// picks up any pdf row still missing a preview on Jenn's next Pages tab visit.
const THUMB_WAIT_MS = 3_000;

export type ShelfRole = "student" | "teacher";

// Every menu item's TEXT used to be chosen by role — two label sets, one
// French and one English — because Jenn's UI was always English and a
// student's always French. That reason is gone: both now read from the same
// dictionary, chosen by the visitor's own locale. What role still decides is
// which items exist at all, which is a different question and still a real
// one: the student has no "add a page". Uploading a whole HTML document is
// Jenn's again — "they can only upload a PDF, not a website" — and this is
// where that narrowing happens. addShelfPage stays on the server with its
// guard and its tests intact, because the guard is correct and what changed
// is which control is drawn.
//
// "Add a student" is deliberately absent from Jenn's menu: creating a student
// is an admin-level act and has no meaning inside one student's page.

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
  onAddFlashcard,
  locale,
}: {
  role: ShelfRole;
  onAddLink: (input: { url: string }) => Promise<void>;
  // Optional, and the optionality is the feature: a student's menu does not
  // offer it, so a student page has nothing to pass.
  onAddPage?: (input: { html: string }) => Promise<void>;
  onAddPdf: (formData: FormData) => Promise<void>;
  // Both roles get this one — a card is vocabulary from the lesson and either
  // party writes it down. Unlike onAddPage, which is Jenn's alone because a
  // student may upload a PDF and not a whole website.
  onAddFlashcard: (input: {
    front: string;
    back: string;
    note: string;
  }) => Promise<void>;
  // This is a client component, so it cannot call headers() itself — the
  // server component above it (app/g/[slug]/page.tsx) reads the locale once
  // and hands it down; getStrings(locale) below rebuilds the dictionary here
  // rather than taking the resolved object as a prop — see lib/strings.ts on
  // why that object cannot cross the boundary.
  locale: Locale;
}) {
  const strings = getStrings(locale);
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
      // The action's own thrown messages are internal (English, written for a
      // stack trace) and are deliberately discarded here: the visitor gets one
      // sentence from the dictionary instead of a leaked internal string.
      setError(strings.student.shelf.linkError);
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
      setError(strings.student.shelf.pageError);
    } finally {
      setSaving(false);
    }
  }

  // Stages the file and NOTHING else, exactly as NewPageForm does: the title
  // has to be visible and editable before anything is sent.
  function stagePdf(file: File) {
    setError(null);
    // Checked again on the server, which is the authority. Telling them before
    // a 3 MB upload rather than after — and in whichever language the rest of
    // this form is speaking.
    if (file.size > MAX_PDF_BYTES) {
      setError(strings.student.shelf.pdfTooLarge);
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
      setError(strings.student.shelf.pdfError);
    } finally {
      setSaving(false);
    }
  }

  const shelf = strings.student.shelf;
  // The role distinction that survives: WHICH items exist, not what language
  // they are drawn in. "page" is teacher-only regardless of locale.
  const choices =
    role === "teacher"
      ? [
          { key: "link", label: shelf.addLink },
          { key: "page", label: shelf.addPage },
          { key: "pdf", label: shelf.addPdf },
          { key: "card", label: strings.student.deck.addTitle },
        ]
      : [
          { key: "link", label: shelf.addLink },
          { key: "pdf", label: shelf.addPdf },
          { key: "card", label: strings.student.deck.addTitle },
        ];

  return (
    <>
      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={choices}
          onChoose={(key) => setOpen(key as Open)}
          onDismiss={() => setOpen(null)}
          dismissLabel={strings.common.close}
        />
      )}

      {open === "link" && (
        <AddSheet
          title={shelf.addLink}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <form onSubmit={submitLink} className="flex flex-col gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label={shelf.linkUrlAriaLabel}
              required
              autoFocus
              className={cn(fieldClassName, "mt-0")}
            />
            {/* One field: the name is taken from the address itself. */}
            <button
              type="submit"
              disabled={saving || url.trim() === ""}
              className={shelfSubmitButton}
            >
              {saving ? strings.common.saving : strings.common.save}
            </button>
            {error && (
              <p role="alert" className={formErrorText}>
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      {open === "page" && onAddPage && (
        <AddSheet
          title={shelf.addPage}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <HtmlPasteBox
            tone="card"
            labels={{
              prompt: shelf.pastePrompt,
              accepted: shelf.pasteAccepted,
              ariaLabel: shelf.pasteAriaLabel,
            }}
            onHtml={submitPage}
            errorFor={() => shelf.pasteNotHtml}
          />
          {error && (
            <p role="alert" className={cn("mt-2", formErrorText)}>
              {error}
            </p>
          )}
        </AddSheet>
      )}

      {open === "pdf" && (
        <AddSheet
          title={shelf.addPdf}
          closeLabel={strings.common.close}
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
              inputLabel={shelf.choosePdf}
              emptyHint={shelf.pdfHint}
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
                aria-label={shelf.titleAriaLabel}
                required
                className={cn(fieldClassName, "mt-0")}
              />
            )}

            <button
              type="submit"
              disabled={saving || !pdfFile || pdfTitle.trim() === ""}
              className={shelfSubmitButton}
            >
              {saving ? strings.common.saving : strings.common.save}
            </button>

            {error && (
              <p role="alert" className={formErrorText}>
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      {open === "card" && (
        <AddSheet
          title={strings.student.deck.addTitle}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <AddFlashcardForm
            locale={locale}
            onAdd={onAddFlashcard}
            onDone={() => {
              setOpen(null);
              // The deck is server-rendered, so a refresh is what makes the new
              // card appear rather than a local insert that could disagree
              // with it — the same reason `done()` above refreshes.
              router.push("?tab=deck");
              router.refresh();
            }}
          />
        </AddSheet>
      )}

      <Fab
        label={shelf.add}
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
