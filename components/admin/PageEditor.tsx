"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { HtmlDropZone } from "@/components/admin/HtmlDropZone";
import { cn } from "@/lib/utils";
import type { PageInput } from "@/app/page-actions";

export type PageEditorGroup = { id: string; name: string };

export function PageEditor({
  groups,
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  groups: PageEditorGroup[];
  initial?: { title: string; html: string; groupIds: string[] };
  submitLabel: string;
  onSubmit: (input: PageInput) => Promise<unknown>;
  onDelete?: () => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  // The html still lives here, exactly as before — the drop zone simply never
  // shows it. Saving an existing page without touching the file therefore
  // re-submits the identical html and page-actions needs no change.
  const [html, setHtml] = useState(initial?.html ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the current title came from a filename rather than typing:
  // a filename-derived title should follow the file when it's swapped for
  // another, but a title the teacher typed herself must never be overwritten.
  const [titleFromFile, setTitleFromFile] = useState(false);

  // The file never reaches the server: it is read in the browser and the text
  // goes straight into state, so the source stays editable by re-uploading.
  function handleFile(file: File, text: string) {
    setError(null);
    setHtml(text);
    setFileName(file.name);
    if (!title || titleFromFile) {
      setTitle(file.name.replace(/\.html?$/i, ""));
      setTitleFromFile(true);
    }
  }

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
    try {
      await onSubmit({ title, html, groupIds });
      setSaved(true);
      if (!initial) {
        setTitle("");
        setHtml("");
        setFileName(null);
        setGroupIds([]);
        setTitleFromFile(false);
      }
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
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleFromFile(false);
          }}
          required
        />
      </label>

      <fieldset className="text-sm font-medium text-[var(--color-ink)]">
        <legend className="mb-2">Groups</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No groups yet.
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

      <div className="text-sm font-medium text-[var(--color-ink)]">
        Page file
        <HtmlDropZone
          fileName={fileName}
          hasExisting={Boolean(initial)}
          onFile={handleFile}
          onError={setError}
        />
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button type="submit" disabled={saving || deleting || html.trim() === ""}>
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
    </form>
  );
}
