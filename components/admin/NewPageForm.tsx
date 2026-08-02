"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { cn } from "@/lib/utils";
import type { NewPageInput } from "@/app/page-actions";

// Audience first, paste second — DOM order matters here, because the paste is
// the submit. There is no Save button: the title comes from the document, so
// once the audience is chosen there is nothing left to fill in.
export function NewPageForm({
  groups,
  defaultGroupId,
  onSubmit,
  onDone,
}: {
  groups: { id: string; name: string }[];
  // The Pages tab's active student chip. A new page defaults to whoever is
  // being looked at; null when the filter is "All".
  defaultGroupId: string | null;
  onSubmit: (input: NewPageInput) => Promise<unknown>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [groupIds, setGroupIds] = useState<string[]>(
    defaultGroupId ? [defaultGroupId] : [],
  );
  // A default should follow the filter while she has expressed no opinion, and
  // must never overwrite a choice she made herself.
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      await onSubmit({ html, groupIds });
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
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
        Page
        <HtmlPasteBox
          tone="admin"
          labels={{
            prompt: saving
              ? "Publishing…"
              : "Paste the page's HTML here (⌘V) — it publishes straight away",
            accepted: (size) => `Published — ${size}`,
            ariaLabel: "HTML of the page to publish",
          }}
          onHtml={handleHtml}
        />
        <p className="mt-2 text-sm font-normal text-[var(--color-ink-muted)]">
          The title comes from the document. You can rename it afterwards; the
          link it gets is permanent.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </div>
  );
}
