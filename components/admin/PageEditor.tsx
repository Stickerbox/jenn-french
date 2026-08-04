"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { MAX_PDF_BYTES } from "@/lib/page-pdf";
import type { PageKind } from "@/lib/page-kind";
import { cn } from "@/lib/utils";
import type { PageInput, PageSaveResult } from "@/app/page-actions";
import { SkippedAssets } from "@/components/admin/SkippedAssets";
import { renderPdfThumbnail } from "@/components/admin/pdf-thumbnail";

export type PageEditorGroup = { id: string; name: string };

// The edit form behind /admin/pages/[slug], and nothing else. Creating a page
// lives in NewPageForm now, which is why `initial` is required here and why
// every "is this the create form?" branch is gone.
//
// The title field stays. A page's slug is derived from its title once and never
// moves — students bookmark it — but the title itself is display text and
// fixing a typo in one must remain possible.
export function PageEditor({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onSubmitPdf,
  onDelete,
}: {
  groups: PageEditorGroup[];
  initial: {
    title: string;
    // Empty for a pdf row, which has no document to hold. `kind` is what
    // decides which of the two submit paths this form takes.
    html: string;
    groupIds: string[];
    kind: PageKind;
    pdfSize: number | null;
  };
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<PageSaveResult>;
  // Separate from onSubmit because the payloads differ in kind, not just in
  // shape: a document is a string and a PDF is bytes in FormData.
  onSubmitPdf: (formData: FormData) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}) {
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
  // The html lives here, exactly as it did behind the drop zone — the paste box
  // simply never shows it. Saving without pasting anything re-submits the
  // identical document, so page-actions needs no change.
  const [html, setHtml] = useState(initial.html);
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<PageSaveResult["skipped"]>([]);

  // Something to save. A pdf row always has: its bytes are already stored, and
  // the title and the audience are the usual reason to open this form at all.
  const hasContent = initial.kind === "pdf" ? true : html.trim() !== "";

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
      if (initial.kind === "pdf") {
        const formData = new FormData();
        formData.set("title", title);
        for (const id of groupIds) formData.append("groupIds", id);
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
        const result = await onSubmit({ title, html, groupIds });
        setSkipped(result.skipped);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
      setError(err instanceof Error ? err.message : "Could not delete the page");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Title
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-2">Students</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No students yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const checked = groupIds.includes(group.id);
              return (
                // A real checkbox, visually hidden inside its own label: the
                // pill is appearance only, so keyboard and screen readers get
                // the control they already understood.
                <label
                  key={group.id}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-2 text-sm font-normal transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]/40",
                    checked
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                      : "border-[var(--color-field-border)] bg-[var(--color-field)] text-[var(--color-ink-muted)]",
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

      {initial.kind === "pdf" ? (
        <div className="text-sm font-medium text-[var(--color-ink)]">
          Replace the PDF
          {/* A PDF cannot be pasted, so this is the one staging control that is
              still a file input. The existing document is described rather than
              shown: there is nothing to edit inside it. */}
          <FileDropZone
            fileName={pdfFile?.name ?? null}
            fileSize={pdfFile?.size ?? initial.pdfSize}
            hasExisting
            accept=".pdf,application/pdf"
            inputLabel="PDF to replace this one with"
            emptyHint="Drop a PDF here, or click to choose one"
            existingHint="A PDF is published. Drop a new one to replace it."
            onFile={(file) => {
              setError(null);
              // The cap is checked again on the server, which is the authority.
              // This is the courtesy of telling her before a 3 MB upload rather
              // than after.
              if (file.size > MAX_PDF_BYTES) {
                setError("That PDF is larger than 3 MB.");
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
              Preparing preview…
            </p>
          )}
        </div>
      ) : (
        <div className="text-sm font-medium text-[var(--color-ink)]">
          Replace the page
          {/* Unlike the create form, pasting here does NOT save: there is a title
              and an audience on this screen that a paste must not commit behind
              her. It stages the new document and Save commits everything. */}
          <HtmlPasteBox
            tone="admin"
            labels={{
              prompt: "Paste the page's HTML here (⌘V) to replace it",
              accepted: (size) => `New version staged — ${size}. Save to publish it.`,
              ariaLabel: "HTML to replace this page with",
            }}
            onHtml={setHtml}
          />
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <Button type="submit" disabled={saving || deleting || !hasContent}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="text-sm text-[var(--color-ink-muted)] underline"
          >
            {deleting ? "Deleting..." : "Delete page"}
          </button>
        )}
        {saved && (
          <span className="text-sm text-[var(--color-ink-muted)]">Saved</span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}

      <SkippedAssets skipped={skipped} />
    </form>
  );
}
