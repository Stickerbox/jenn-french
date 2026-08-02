"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LinkInput } from "@/app/page-actions";

// Always visible, not inside the Collapsible the page uploader lives in.
// Adding a link is two fields; burying it under a disclosure beside a
// whole-screen upload form would make the easy thing look like the hard one.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = groups.find((group) => group.id === defaultGroupId) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        url,
        groupIds: defaultGroupId ? [defaultGroupId] : [],
      });
      setUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-3">
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

      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        {target
          ? `Will be shared with ${target.name}.`
          : "Pick a student above to share this with, or it will be added for nobody."}
      </p>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
