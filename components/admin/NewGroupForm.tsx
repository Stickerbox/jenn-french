"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cardFieldSkin } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

export function NewGroupForm({
  onSubmit,
  locale,
}: {
  onSubmit: (name: string) => Promise<void>;
  // This is a client component reached directly from AdminChrome, so it
  // takes `locale` rather than the resolved `strings` object — a `Strings`
  // value holds functions and cannot cross that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.newGroupForm;
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
      setError(err instanceof Error ? err.message : strings.admin.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--card-ink)]">
        {labels.nameLabel}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={cardFieldSkin}
        />
      </label>
      <p className="text-sm font-normal text-[var(--color-ink-muted)]">
        {labels.helper}
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? strings.common.adding : labels.addButton}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--card-rouge)]">
          {error}
        </p>
      )}
    </form>
  );
}
