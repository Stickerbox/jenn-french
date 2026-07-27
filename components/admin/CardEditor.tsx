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
  cardPanelBack,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";
import { formatCardDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CardInput } from "@/app/actions";
import { suggestCardFields } from "@/app/ai-actions";
import { applySuggestion } from "@/lib/card-suggestions";

const panelLabel =
  "mb-2 font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[var(--color-ink-muted)]";

export function CardEditor({
  initialDate,
  initialValues,
  onSubmit,
  onDelete,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
  onDelete?: (date: string) => Promise<void>;
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

  // A card that already exists for this date opens straight in the editor —
  // it has been generated and saved once already.
  const [stage, setStage] = useState<"compose" | "generating" | "editing">(
    initialValues?.englishPrompt && initialValues?.frenchAnswer
      ? "editing"
      : "compose",
  );
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update<K extends keyof CardInput>(key: K, value: CardInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGenerate() {
    setAiError(null);
    setStage("generating");

    let result;
    try {
      result = await suggestCardFields({
        englishPrompt: values.englishPrompt,
        frenchAnswer: values.frenchAnswer,
        subject: values.subject,
      });
    } catch {
      setAiError("Claude couldn't be reached. Try again.");
      setStage("compose");
      return;
    }

    if (!result.ok) {
      setAiError(result.error);
      setStage("compose");
      return;
    }

    setValues((prev) => applySuggestion(prev, result.suggestion));
    setStage("editing");
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

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(values.date);
      // Drop back to compose on the same date, blank. The teacher stays on
      // the day they were looking at, now ready to generate again.
      setValues({
        date: values.date,
        subject: "",
        usage: "",
        pronunciation: "",
        englishPrompt: "",
        hint: "",
        frenchAnswer: "",
        examples: "",
        tip: "",
        idiom: "",
      });
      setConfirmingDelete(false);
      setStage("compose");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the card");
    } finally {
      setDeleting(false);
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

  if (stage !== "editing") {
    const busy = stage === "generating";
    const ready =
      values.englishPrompt.trim() !== "" &&
      values.frenchAnswer.trim() !== "" &&
      values.subject.trim() !== "";

    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        <label className="text-sm font-medium text-[var(--color-ink)]">
          English phrase *
          <Input
            value={values.englishPrompt}
            onChange={(e) => update("englishPrompt", e.target.value)}
            placeholder="I used to pack a lunch every day"
            disabled={busy}
            required
          />
        </label>

        <label className="text-sm font-medium text-[var(--color-ink)]">
          French phrase *
          <Input
            value={values.frenchAnswer}
            onChange={(e) => update("frenchAnswer", e.target.value)}
            placeholder="Je faisais un lunch chaque jour"
            disabled={busy}
            required
          />
        </label>

        <label className="text-sm font-medium text-[var(--color-ink)]">
          Subject *
          <Input
            value={values.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder="Imparfait"
            disabled={busy}
            required
          />
        </label>

        <Button type="button" onClick={handleGenerate} disabled={!ready || busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
              Generating…
            </span>
          ) : (
            "Generate"
          )}
        </Button>

        {aiError && (
          <p role="alert" className="text-sm text-[var(--color-accent)]">
            {aiError}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6"
    >
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

      <div>
        <div className={panelLabel}>Back</div>
        <div className={cardPanelBack}>
          <span className={accentBarClass} style={accentBarStyle} />
          {cardHeader}
          <div className={cn("mb-1", cardEyebrow)}>The answer *</div>
          <EditableText
            value={values.frenchAnswer}
            onChange={(v) => update("frenchAnswer", v)}
            placeholder="French answer"
            ariaLabel="French answer"
            multiline
            required
            className="mb-5 font-[var(--card-font-serif)] text-2xl leading-snug text-[var(--card-bleu)]"
          />

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Grammar</h4>
            <EditableText
              value={values.examples}
              onChange={(v) => update("examples", v)}
              placeholder="Grammar notes (optional)"
              ariaLabel="Grammar"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Québec Pronunciation</h4>
            <EditableText
              value={values.pronunciation}
              onChange={(v) => update("pronunciation", v)}
              placeholder="Pronunciation (optional)"
              ariaLabel="Québec pronunciation"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>

          <div className="mb-4">
            <h4 className={cardSectionHeading}>Tip</h4>
            <EditableText
              value={values.tip}
              onChange={(v) => update("tip", v)}
              placeholder="Tip (optional)"
              ariaLabel="Tip"
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>

          <div>
            <h4 className={cardSectionHeading}>Idiom of the day</h4>
            <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
              <EditableText
                value={values.idiom}
                onChange={(v) => update("idiom", v)}
                placeholder="e.g. faire un lunch — to pack a lunch (optional)"
                ariaLabel="Idiom of the day"
                multiline
                className="text-[15px] italic text-[var(--card-rouge)]"
              />
            </div>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save card"}
      </Button>
      {onDelete &&
        (confirmingDelete ? (
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="text-[var(--color-ink-muted)]">
              Delete this card?
            </span>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mx-auto text-sm text-[var(--color-ink-muted)] underline"
          >
            Delete card
          </button>
        ))}
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </form>
  );
}
