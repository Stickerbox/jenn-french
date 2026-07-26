"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { CardInput } from "@/app/actions";

export function CardForm({
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Date
        <Input
          type="date"
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Subject
        <Input
          value={values.subject}
          onChange={(e) => update("subject", e.target.value)}
          placeholder="e.g. Imparfait, or Idioms"
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Usage (shown above the prompt)
        <Input
          value={values.usage}
          onChange={(e) => update("usage", e.target.value)}
          placeholder="e.g. Habits of the past"
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Québec pronunciation
        <Input
          value={values.pronunciation}
          onChange={(e) => update("pronunciation", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        English sentence to translate
        <Textarea
          value={values.englishPrompt}
          onChange={(e) => update("englishPrompt", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Hint (shown below the English sentence)
        <Input
          value={values.hint}
          onChange={(e) => update("hint", e.target.value)}
          placeholder="e.g. &quot;used to&quot; = repeated habits → imparfait"
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        French answer
        <Textarea
          value={values.frenchAnswer}
          onChange={(e) => update("frenchAnswer", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Grammar
        <Textarea
          value={values.examples}
          onChange={(e) => update("examples", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Tip
        <Input value={values.tip} onChange={(e) => update("tip", e.target.value)} />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Idiom of the day (leave blank to hide this section)
        <Textarea
          value={values.idiom}
          onChange={(e) => update("idiom", e.target.value)}
          placeholder="e.g. faire un lunch — to pack a lunch"
        />
      </label>
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
