"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  audiencePill,
  audiencePillChecked,
  audiencePillUnchecked,
  cardFieldSkin,
} from "@/components/card-styles";
import { MAX_PDF_BYTES } from "@/lib/page-pdf";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NewPageInput, PageSaveResult } from "@/app/page-actions";
import { SkippedAssets } from "@/components/admin/SkippedAssets";
import { renderPdfThumbnail } from "@/components/pdf-thumbnail";
import { captureAndStoreThumbnail } from "@/components/html-thumbnail";

// Audience first, content second — DOM order matters on the document half,
// because there the paste is the submit and there is nothing left to fill in
// once the audience is chosen.
//
// The PDF half is deliberately NOT that flow any more. Choosing a file used to
// upload it immediately, which meant she could not tick a student afterwards —
// the sheet had already closed. So a staged PDF opens a title field and a Save
// button, and choosing the file stages it and nothing else.
export function NewPageForm({
  groups,
  defaultGroupId,
  onSubmit,
  onSubmitPdf,
  onDone,
  locale,
}: {
  groups: { id: string; name: string }[];
  // The Pages tab's active student chip. A new page defaults to whoever is
  // being looked at; null when the filter is "All".
  defaultGroupId: string | null;
  onSubmit: (input: NewPageInput) => Promise<PageSaveResult>;
  // Separate from onSubmit because the payloads differ in kind, not just in
  // shape: a document is a string and a PDF is bytes in FormData.
  onSubmitPdf: (formData: FormData) => Promise<unknown>;
  onDone: () => void;
  // This is a client component reached directly from AdminChrome, so it
  // takes `locale` rather than the resolved `strings` object — a `Strings`
  // value holds functions and cannot cross that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.newPageForm;
  const router = useRouter();
  const [groupIds, setGroupIds] = useState<string[]>(
    defaultGroupId ? [defaultGroupId] : [],
  );
  // A default should follow the filter while she has expressed no opinion, and
  // must never overwrite a choice she made herself.
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<PageSaveResult["skipped"]>([]);

  // The staged PDF, and null until she chooses one. Staging is not submitting.
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  // The same don't-clobber rule the default audience has, for the same reason:
  // a title derived from a filename must never overwrite one she typed herself.
  const [titleTouched, setTitleTouched] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // The in-flight preview render. A ref so submit can AWAIT it rather than race
  // a boolean: staging a file and pressing Save at once would otherwise drop the
  // preview silently.
  const thumbJob = useRef<Promise<Blob | null> | null>(null);

  // Adjusted during render rather than in an effect: this is state derived from
  // a prop, and react-hooks/set-state-in-effect rejects the effect form for
  // exactly this shape — an effect would render once with the stale selection
  // and then render again. React's documented pattern is to compare against the
  // previous prop here and correct before anything paints.
  const [lastDefault, setLastDefault] = useState(defaultGroupId);
  if (lastDefault !== defaultGroupId) {
    setLastDefault(defaultGroupId);
    if (!touched) setGroupIds(defaultGroupId ? [defaultGroupId] : []);
  }

  function toggleGroup(id: string) {
    setTouched(true);
    setGroupIds((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id],
    );
  }

  async function handleHtml(html: string) {
    setSaving(true);
    setError(null);
    setSkipped([]);
    try {
      const result = await onSubmit({ html, groupIds });
      router.refresh();

      // After the save, never before: the capture frames the page as it is
      // STORED, through the same route and the same CSP a student gets, so a
      // preview can only ever be honest about what that page actually does.
      // Framing the html in memory would render assets the stored page cannot
      // load and put a perfect picture over a broken document.
      //
      // Not awaited into the flow below and unable to fail it — onDone() and
      // the skipped-assets branch behave exactly as they did. A page with no
      // JPEG renders the live iframe, which is a working preview.
      //
      // The version is null deliberately. This form does not hold updatedAt,
      // and any token it could pass would be stale by construction on a page
      // written a moment ago; null omits ?v= and takes the no-store response,
      // which is exactly right for a one-shot read. ThumbBackfill reads from
      // the server and passes a real one.
      void captureAndStoreThumbnail(result.slug, null).then((stored) => {
        // Only when something landed, so the common failure costs no render.
        if (stored) router.refresh();
      });
      // The sheet closing is what makes the one-gesture flow feel finished, so
      // it still closes on a clean publish. It stays open when something could
      // not be folded in, because that list exists nowhere else — closing would
      // be the "warning nobody sees" this report was added to prevent.
      if (result.skipped.length > 0) {
        setSkipped(result.skipped);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.admin.genericError);
    } finally {
      setSaving(false);
    }
  }

  // Stages the file and NOTHING else. It does not submit and it does not close
  // the sheet: she has to be able to tick a student after choosing the document,
  // which the old choose-is-submit flow made impossible.
  function handlePdf(file: File) {
    setError(null);
    // Checked again on the server, which is the authority. Telling her before a
    // 3 MB upload rather than after.
    if (file.size > MAX_PDF_BYTES) {
      setError(strings.admin.pdfTooLarge);
      return;
    }

    setPdfFile(file);
    // The title still comes from the filename, the way the document's comes
    // from its <title> — but only until she edits it herself.
    if (!titleTouched) setPdfTitle(file.name.replace(/\.pdf$/i, ""));

    setPreparing(true);
    // Started on stage rather than at submit so it renders WHILE she picks the
    // audience. The work is free: she was going to spend that time choosing.
    const job = renderPdfThumbnail(file);
    thumbJob.current = job;
    void job.then(() => {
      // A newer file may have been staged while this one was rendering.
      if (thumbJob.current !== job) return;
      setPreparing(false);
    });
  }

  // The only submit path for a PDF. Not reachable from the drop zone, not from
  // an onChange, and nothing calls requestSubmit().
  async function handlePdfSubmit() {
    if (!pdfFile) return;

    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("title", pdfTitle);
      for (const id of groupIds) formData.append("groupIds", id);
      formData.set("pdf", pdfFile);
      // Awaited, not read from state: a render still in flight is not a reason
      // to save without a preview, and a failed one resolves null and saves
      // without one — which is the fallback the glyph exists to be.
      const rendered = thumbJob.current ? await thumbJob.current : null;
      if (rendered) formData.set("thumb", rendered, "thumb.jpg");

      await onSubmitPdf(formData);
      setPdfFile(null);
      setPdfTitle("");
      setTitleTouched(false);
      setPreparing(false);
      thumbJob.current = null;
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.admin.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="text-sm font-medium text-[var(--card-ink)]">
        <legend className="mb-2">{strings.admin.pageForm.studentsLegend}</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            {strings.admin.pageForm.noStudentsYet}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const checked = groupIds.includes(group.id);
              return (
                <label
                  key={group.id}
                  className={cn(
                    audiencePill,
                    checked ? audiencePillChecked : audiencePillUnchecked,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleGroup(group.id)}
                  />
                  {group.name}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="text-sm font-medium text-[var(--card-ink)]">
        {labels.pageLabel}
        {/* tone="card": HtmlPasteBox already had both skins (see its own
            comment) — the student shelf's upload uses "card" too, so this is
            a caller-side flip, not a new capability. */}
        <HtmlPasteBox
          tone="card"
          labels={{
            prompt: saving ? labels.publishing : labels.pastePrompt,
            accepted: labels.pasteAccepted,
            ariaLabel: labels.pasteAriaLabel,
          }}
          onHtml={handleHtml}
        />
        <p className="mt-2 text-sm font-normal text-[var(--color-ink-muted)]">
          {labels.titleFromDocumentNote}
        </p>
      </div>

      <div className="text-sm font-medium text-[var(--card-ink)]">
        {labels.pdfLabel}
        <FileDropZone
          fileName={pdfFile?.name ?? null}
          fileSize={pdfFile?.size ?? null}
          hasExisting={pdfFile !== null}
          accept=".pdf,application/pdf"
          inputLabel={labels.pdfInputLabel}
          emptyHint={labels.pdfEmptyHint}
          existingHint={labels.pdfExistingHint}
          onFile={handlePdf}
        />
        {preparing && (
          <p className="mt-1 text-xs font-normal text-[var(--color-ink-muted)]">
            {strings.admin.preparingPreview}
          </p>
        )}
        <p className="mt-2 text-sm font-normal text-[var(--color-ink-muted)]">
          {labels.titleFromFilenameNote}
        </p>

        {/* Only once something is staged. Until then this half of the sheet is
            one control, exactly as it was. */}
        {pdfFile && (
          <div className="mt-3 flex flex-col gap-3">
            <label className="text-sm font-medium text-[var(--card-ink)]">
              {strings.admin.titleLabel}
              <Input
                value={pdfTitle}
                onChange={(e) => {
                  setTitleTouched(true);
                  setPdfTitle(e.target.value);
                }}
                required
                className={cardFieldSkin}
              />
            </label>

            <div className="flex items-center justify-center gap-4">
              <Button
                type="button"
                onClick={() => void handlePdfSubmit()}
                // A preview still rendering is deliberately NOT a reason she
                // cannot save: the submit awaits the job anyway.
                disabled={saving || pdfTitle.trim() === ""}
              >
                {saving ? labels.publishing : labels.publishPdf}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPdfFile(null);
                  setPdfTitle("");
                  setTitleTouched(false);
                  setPreparing(false);
                  thumbJob.current = null;
                }}
                disabled={saving}
                className="text-sm font-normal text-[var(--color-ink-muted)] underline"
              >
                {labels.remove}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
          {error}
        </p>
      )}

      <SkippedAssets skipped={skipped} strings={strings} />
    </div>
  );
}
