"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function NewGroupForm({
  onSubmit,
}: {
  onSubmit: (name: string, slug: string) => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(name, slug);
      setName("");
      setSlug("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Group name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Slug (used in the link, e.g. &quot;a1&quot;)
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>
      <Button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create group"}
      </Button>
    </form>
  );
}
