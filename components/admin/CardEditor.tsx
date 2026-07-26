"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EditableText } from "@/components/admin/EditableText";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardSubjectPill,
} from "@/components/card-styles";
import { formatCardDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CardInput } from "@/app/actions";

const panelLabel =
  "mb-2 font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";

export function CardEditor({
  initialDate,
  initialValues,
  onSubmit,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CardInput>({
    date: initialDate,
    subject: initialValues?.subject ?? "",
    usage: initialValues?.usage ?? "",
    pronunciation: initialValues?.pronunciation ?? "",
    englishPrompt: initialValues?.englishPrompt ?? "",
    hint: initialValues?.hint ?? "",
    frenchAnswer: initialValues?.frenchAnswer ?? "",
    examples: initialValues?.examples ?? "",
    tip: initialValues?.tip ?? "",
    idiom: initialValues?.idiom ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CardInput>(key: K, value: CardInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const dateLabel = values.date
    ? formatCardDate(new Date(`${values.date}T00:00:00Z`))
    : "—";

  const cardHeader = (
    <div className={cardHeaderRow}>
      <span className={cardDateLabel}>{dateLabel}</span>
      <EditableText
        value={values.subject}
        onChange={(v) => update("subject", v)}
        placeholder="Subject"
        ariaLabel="Subject"
        className={cn(cardSubjectPill, "w-auto max-w-[45%] text-right")}
      />
    </div>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6"
    >
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Date *
        <Input
          type="date"
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          required
        />
      </label>

      <div>
        <div className={panelLabel}>Front</div>
        <div className={cardPanel}>
          <span className={accentBarClass} style={accentBarStyle} />
          {cardHeader}
          <EditableText
            value={values.usage}
            onChange={(v) => update("usage", v)}
            placeholder="Usage — e.g. Habits of the past"
            ariaLabel="Usage"
            className="mb-1.5 font-[var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]"
          />
          <div className={cn("mb-2", cardEyebrow)}>Say it in French *</div>
          <EditableText
            value={values.englishPrompt}
            onChange={(v) => update("englishPrompt", v)}
            placeholder="English sentence to translate"
            ariaLabel="English sentence to translate"
            multiline
            required
            className="font-[var(--card-font-serif)] text-xl leading-relaxed text-[var(--card-ink)]"
          />
          <EditableText
            value={values.hint}
            onChange={(v) => update("hint", v)}
            placeholder="Hint (optional)"
            ariaLabel="Hint"
            multiline
            className="mt-4 font-[var(--card-font-serif)] text-sm italic text-[var(--card-moss)]"
          />
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save card"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
