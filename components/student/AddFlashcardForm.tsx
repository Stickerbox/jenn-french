"use client";

import { useState, type FormEvent } from "react";
import { fieldClassName } from "@/components/ui/field";
import { cardFocusRing, formErrorText } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import { MAX_CARD_FACE, MAX_CARD_NOTE } from "@/lib/deck-limits";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const submitClass = cn(
  "min-h-[44px] rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none",
  cardFocusRing,
);

export function AddFlashcardForm({
  locale,
  onAdd,
  onDone,
}: {
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onAdd: (input: { front: string; back: string; note: string }) => Promise<void>;
  onDone: () => void;
}) {
  const t = getStrings(locale).student.deck;
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ front, back, note });
      onDone();
    } catch {
      // The action's own thrown messages are internal and written for a stack
      // trace. The visitor gets one sentence from the dictionary instead of a
      // leaked internal string — the rule ShelfFab's own catches already
      // follow.
      setError(t.addError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.frontLabel}
        <input
          value={front}
          onChange={(event) => setFront(event.target.value)}
          required
          autoFocus
          // The courtesy; the action is the authority. Without it an
          // over-long card fails on submit with a generic sentence, which
          // tells the writer nothing about what to shorten.
          maxLength={MAX_CARD_FACE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.backLabel}
        <input
          value={back}
          onChange={(event) => setBack(event.target.value)}
          required
          maxLength={MAX_CARD_FACE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <label className="text-sm font-medium text-[var(--card-ink)]">
        {t.noteLabel}{" "}
        <span className="font-normal text-[var(--color-ink-muted)]">
          {t.noteHint}
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_CARD_NOTE}
          className={cn(fieldClassName, "mt-1")}
        />
      </label>

      <button
        type="submit"
        disabled={saving || front.trim() === "" || back.trim() === ""}
        className={submitClass}
      >
        {saving ? getStrings(locale).common.saving : t.save}
      </button>

      {error && (
        <p role="alert" className={formErrorText}>
          {error}
        </p>
      )}
    </form>
  );
}
