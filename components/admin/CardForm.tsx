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
    frenchWord: initialValues?.frenchWord ?? "",
    wordType: initialValues?.wordType ?? "",
    pronunciation: initialValues?.pronunciation ?? "",
    englishPrompt: initialValues?.englishPrompt ?? "",
    frenchAnswer: initialValues?.frenchAnswer ?? "",
    examples: initialValues?.examples ?? "",
    tip: initialValues?.tip ?? "",
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
        French word
        <Input
          value={values.frenchWord}
          onChange={(e) => update("frenchWord", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Word type / tense
        <Input
          value={values.wordType}
          onChange={(e) => update("wordType", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Pronunciation
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
        French answer
        <Textarea
          value={values.frenchAnswer}
          onChange={(e) => update("frenchAnswer", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Example sentences (one per line)
        <Textarea
          value={values.examples}
          onChange={(e) => update("examples", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Tip
        <Input value={values.tip} onChange={(e) => update("tip", e.target.value)} />
      </label>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save word"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
