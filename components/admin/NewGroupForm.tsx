"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function NewGroupForm({
  onSubmit,
}: {
  onSubmit: (name: string) => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Student name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <p className="text-sm font-normal text-[var(--color-ink-muted)]">
        Their link is made from this name — “Marie Dupont” becomes /g/marie-dupont.
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? "Adding..." : "Add student"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
