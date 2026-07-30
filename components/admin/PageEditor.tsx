"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { PageInput } from "@/app/page-actions";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

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
  const [html, setHtml] = useState(initial?.html ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the current title came from a filename rather than typing:
  // a filename-derived title should follow the file when it's swapped for
  // another, but a title the teacher typed herself must never be overwritten.
  const [titleFromFile, setTitleFromFile] = useState(false);

  // The file never reaches the server: it is read here and the text goes into
  // the same textarea a paste would fill, so upload and paste are one control
  // and the source stays editable afterwards.
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PAGE_BYTES) {
      setError("That page is larger than 2 MB.");
      event.target.value = "";
      return;
    }
    setHtml(await file.text());
    if (!title || titleFromFile) {
      setTitle(file.name.replace(/\.html?$/i, ""));
      setTitleFromFile(true);
    }
    event.target.value = "";
  }

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id)
        ? current.filter((g) => g !== id)
        : [...current, id],
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
        setGroupIds([]);
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
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the page");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
        <legend className="mb-1">Groups</legend>
        {groups.length === 0 ? (
          <p className="text-sm font-normal text-[var(--color-ink-muted)]">
            No groups yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 text-sm font-normal"
              >
                <input
                  type="checkbox"
                  checked={groupIds.includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                />
                {group.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="text-sm font-medium text-[var(--color-ink)]">
        HTML file
        <input
          type="file"
          accept=".html,.htm,text/html"
          onChange={handleFile}
          className="mt-1 block w-full text-sm font-normal text-[var(--color-ink-muted)]"
        />
      </label>

      <label className="text-sm font-medium text-[var(--color-ink)]">
        HTML source
        <Textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          required
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
        />
      </label>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving || deleting}>
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
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
