"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TrashIcon } from "@/components/ui/TrashIcon";
import { AudienceRequiredNotice } from "@/components/admin/AudienceRequiredNotice";
import { FileDropZone } from "@/components/ui/FileDropZone";
import {
  audiencePill,
  audiencePillChecked,
  audiencePillUnchecked,
  cardFieldSkin,
  cardFocusRing,
  formErrorText,
} from "@/components/card-styles";
import { MAX_PDF_BYTES } from "@/lib/page-pdf";
import type { PageKind } from "@/lib/page-kind";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PageInput, PageSaveResult } from "@/app/page-actions";
import { hasAudienceSelection, type AudienceOption } from "@/lib/audience";
import { SkippedAssets } from "@/components/admin/SkippedAssets";
import { renderPdfThumbnail } from "@/components/pdf-thumbnail";
import { captureAndStoreThumbnail } from "@/components/html-thumbnail";
import { WORKSHEET_FIELD, worksheetFieldValue } from "@/lib/worksheet-field";

// The edit form behind /admin/pages/[slug], and nothing else. Creating a page
// lives in NewPageForm now, which is why `initial` is required here and why
// every "is this the create form?" branch is gone.
//
// The title field stays. A page's slug is derived from its title once and never
// moves — students bookmark it — but the title itself is display text and
// fixing a typo in one must remain possible.
export function PageEditor({
  audience,
  initial,
  submitLabel,
  onSubmit,
  onSubmitPdf,
  onDelete,
  onSaved,
  locale,
}: {
  // From `studentAudienceOptions`, NOT `audienceOptions` — the everyone row is
  // withheld from this form as of 2026-08-07, so sharing with the whole class
  // is decided when a page is made and not afterwards. A page already assigned
  // to that row keeps the assignment through a save, because `groupIds` starts
  // from the stored list and nothing here can remove an id it never drew. See
  // lib/audience.ts, which states that cost and why the alternative is worse.
  audience: AudienceOption[];
  initial: {
    title: string;
    // Empty for a pdf row, which has no document to hold. `kind` is what
    // decides which of the two submit paths this form takes.
    html: string;
    groupIds: string[];
    kind: PageKind;
    pdfSize: number | null;
    worksheet: boolean;
  };
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<PageSaveResult>;
  // Separate from onSubmit because the payloads differ in kind, not just in
  // shape: a document is a string and a PDF is bytes in FormData.
  onSubmitPdf: (formData: FormData) => Promise<unknown>;
  onDelete?: () => Promise<void>;
  // Called after a save that left NOTHING on this form to read. The overlay
  // passes its own close; the standalone route passes nothing, because a page
  // has nothing to close and its "Saved" flag is the whole feedback there.
  onSaved?: () => void;
  // This is a client component reached directly from two server components
  // (app/admin/pages/[slug]/page.tsx and, through PageEditOverlay, the Pages
  // tab and a student's shelf), so it takes `locale` rather than the resolved
  // `strings` object — a `Strings` value holds functions and cannot cross
  // that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.pageEditor;
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  // The staged replacement for a pdf row, and null until she chooses one.
  // Saving without it is a rename or a change of audience, which the action
  // reads as "leave the bytes".
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  // The in-flight preview render. Held as a ref so submit can AWAIT it rather
  // than race a boolean: if she stages a file and presses Save immediately, the
  // preview is still rendering and reading a piece of state would silently drop
  // it.
  const thumbJob = useRef<Promise<Blob | null> | null>(null);
  // The stored document, carried straight back out on save. There is no longer
  // any control on this form that can change it: the "Replace the page" paste
  // box was removed on 2026-08-07, so an html page is edited by republishing it
  // through `POST /api/pages`, which is how the artifacts are written anyway.
  // It is still SUBMITTED, unchanged, because `savePage` writes every content
  // column on every write — dropping it here would blank the page.
  const html = initial.html;
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [worksheet, setWorksheet] = useState(initial.worksheet);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<PageSaveResult["skipped"]>([]);

  // Something to save. A pdf row always has: its bytes are already stored, and
  // the title and the audience are the usual reason to open this form at all.
  const hasContent = initial.kind === "pdf" ? true : html.trim() !== "";

  // Against the pills ON SCREEN, not against groupIds.length — a page shared
  // with the everyone group carries an id this form draws no pill for, and
  // counting it would open Save with every pill still grey. See lib/audience.ts.
  const hasAudience = hasAudienceSelection(groupIds, audience);

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    // Cleared before the attempt, not after it: a stale list from the previous
    // save would otherwise sit under a page that published cleanly.
    setSkipped([]);
    try {
      // Whether this save has anything left for the form to show. A pdf never
      // does: updatePdfPage returns void and reports no skipped assets, so
      // there is nothing its branch could withhold the close for.
      let clean = true;

      if (initial.kind === "pdf") {
        const formData = new FormData();
        formData.set("title", title);
        for (const id of groupIds) formData.append("groupIds", id);
        formData.append(WORKSHEET_FIELD, worksheetFieldValue(worksheet));
        // Absent when she is editing a stored PDF's title or audience without
        // choosing a new file. The action reads that as "leave the bytes".
        if (pdfFile) formData.set("pdf", pdfFile);
        // Awaited, not read from state: see the note on thumbJob. A failed
        // render resolves null and the page saves without a preview, which is
        // the fallback the glyph exists to be.
        const rendered = thumbJob.current ? await thumbJob.current : null;
        // Only ever sent beside a new file, for the same reason the bytes are:
        // without one there is no new preview to offer, and updatePageMeta must
        // not be handed a thumbnail it would have to decide what to do with.
        if (pdfFile && rendered) formData.set("thumb", rendered, "thumb.jpg");
        await onSubmitPdf(formData);
      } else {
        const result = await onSubmit({ title, html, groupIds, worksheet });
        setSkipped(result.skipped);
        clean = result.skipped.length === 0;

        // The html branch only. A pdf save must never touch these columns —
        // its picture comes from renderPdfThumbnail inside its own submission
        // above, and capturing here would photograph a document that is not
        // this one.
        //
        // After the save and against the stored page, for the reason
        // NewPageForm records; null version for the reason it records too.
        // savePage has just nulled both columns, so between here and the reply
        // the tile shows the live iframe rather than the previous document's
        // picture — a missing preview, never a stale one.
        void captureAndStoreThumbnail(result.slug, null).then((stored) => {
          if (stored) router.refresh();
        });
      }
      setSaved(true);
      router.refresh();

      // Last, and only when the form has nothing left to show. A save that
      // skipped assets keeps the sheet open, because that list is stored
      // NOWHERE ELSE — it exists only in the reply to this one request, and
      // closing over it is the "warning nobody sees" the report was added to
      // prevent. NewPageForm already behaves this way; this makes the two
      // forms agree rather than adding a second rule.
      //
      // Fired before the finally below clears `saving`, which is safe only
      // because the overlay's onClose is a router.push — a scheduled
      // transition, not a synchronous unmount — so that setSaving(false)
      // still lands on a mounted component. A close that unmounted
      // synchronously would turn this ordering into a set-state-after-unmount
      // warning.
      if (clean) onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.admin.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
      router.push("/admin?tab=pages");
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="text-sm font-medium text-[var(--card-ink)]">
        {strings.admin.titleLabel}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={cardFieldSkin}
        />
      </label>

      <fieldset className="text-sm font-medium text-[var(--card-ink)]">
        <legend className="mb-2">{strings.admin.pageForm.studentsLegend}</legend>
        {audience.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            {strings.admin.pageForm.noStudentsYet}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {audience.map((option) => {
              const checked = groupIds.includes(option.id);
              return (
                // A real checkbox, visually hidden inside its own label: the
                // pill is appearance only, so keyboard and screen readers get
                // the control they already understood.
                <label
                  key={option.id}
                  className={cn(
                    audiencePill,
                    checked ? audiencePillChecked : audiencePillUnchecked,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleGroup(option.id)}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* Link rows never reach this form — loadPageForEdit and the standalone
          route both refuse a link — but the check stays explicit here too:
          pageTarget checks worksheet before kind, so a link row with the flag
          set would route to the worksheet page instead of its external URL. */}
      {initial.kind !== "link" && (
        <label className="flex items-start gap-2 text-sm text-[var(--card-ink)]">
          <input
            type="checkbox"
            checked={worksheet}
            onChange={(event) => setWorksheet(event.target.checked)}
            className="mt-1"
          />
          <span>
            {labels.worksheetLabel}
            {/* The one sentence of explanation the control needs: the flag changes
                where the tile goes, which is not guessable from the label. */}
            <span className="block text-[var(--color-ink-muted)]">
              {labels.worksheetHelp}
            </span>
          </span>
        </label>
      )}

      {initial.kind === "pdf" && (
        <div className="text-sm font-medium text-[var(--card-ink)]">
          {labels.replacePdfLabel}
          {/* A PDF cannot be pasted, so this is the one staging control that is
              still a file input. The existing document is described rather than
              shown: there is nothing to edit inside it. */}
          <FileDropZone
            fileName={pdfFile?.name ?? null}
            fileSize={pdfFile?.size ?? initial.pdfSize}
            hasExisting
            accept=".pdf,application/pdf"
            inputLabel={labels.pdfReplaceInputLabel}
            emptyHint={strings.admin.newPageForm.pdfEmptyHint}
            existingHint={labels.pdfExistingHint}
            onFile={(file) => {
              setError(null);
              // The cap is checked again on the server, which is the authority.
              // This is the courtesy of telling her before a 3 MB upload rather
              // than after.
              if (file.size > MAX_PDF_BYTES) {
                setError(strings.admin.pdfTooLarge);
                return;
              }
              setPdfFile(file);
              setPreparing(true);

              // Started here rather than at submit so it runs WHILE she picks
              // the audience. The work is free: she was going to spend that
              // time choosing anyway.
              const job = renderPdfThumbnail(file);
              thumbJob.current = job;
              void job.then(() => {
                // A newer file may have been staged while this one rendered.
                if (thumbJob.current !== job) return;
                setPreparing(false);
              });
            }}
          />
          {preparing && (
            <p className="mt-1 text-xs font-normal text-[var(--color-ink-muted)]">
              {strings.admin.preparingPreview}
            </p>
          )}
        </div>
      )}

      {/* An html row has NO content control here. The "Replace the page" paste
          box was removed on 2026-08-07: this screen is for the title, the
          audience and the worksheet flag, and a document is replaced by
          republishing it through POST /api/pages, which is where these
          artifacts come from in the first place. The pdf drop zone above stays,
          because bytes cannot be republished that way. */}

      <div className="flex items-center justify-center gap-4">
        <Button
          type="submit"
          disabled={saving || deleting || !hasContent || !hasAudience}
        >
          {saving ? strings.common.saving : submitLabel}
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            // An icon now, so the label moves to aria-label and title — it was
            // the visible text before. `deleting` shows as the disabled state
            // rather than as a word, which is what the icon costs and is why
            // the button keeps its full 44px box.
            aria-label={labels.deleteLabel}
            title={labels.deleteLabel}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--card-section)] hover:text-[var(--card-rouge)] motion-reduce:transition-none disabled:opacity-50",
              cardFocusRing,
            )}
          >
            <TrashIcon />
          </button>
        )}
        {saved && (
          <span className="text-sm text-[var(--color-ink-muted)]">{labels.saved}</span>
        )}
      </div>

      <AudienceRequiredNotice
        // Only the audience, not `hasContent`: an html row with an empty stored
        // document also shuts Save, and telling her to pick a student would be
        // the wrong reason.
        show={!hasAudience}
        label={strings.admin.pageForm.pickAtLeastOne}
      />

      {error && (
        <p role="alert" className={formErrorText}>
          {error}
        </p>
      )}

      <SkippedAssets skipped={skipped} strings={strings} />
    </form>
  );
}
