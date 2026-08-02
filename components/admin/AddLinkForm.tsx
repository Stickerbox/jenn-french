"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { LinkInput } from "@/app/page-actions";

// Reached from the FAB on the Daily-card and Students tabs as well as Pages,
// where there is no student chip to inherit from — so the audience has to be
// real checkboxes here too, the same shape NewPageForm already needed for the
// same reason, rather than a note pointing at a control that may not be on
// screen.
export function AddLinkForm({
  groups,
  defaultGroupId,
  onSubmit,
}: {
  groups: { id: string; name: string }[];
  defaultGroupId: string | null;
  onSubmit: (input: LinkInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ url, groupIds });
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/…"
          aria-label="Link address"
          required
        />
        <Button type="submit" disabled={saving || url.trim() === ""}>
          {saving ? "Adding..." : "Add link"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
