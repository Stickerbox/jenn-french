"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { RichText } from "@/components/admin/RichText";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { StudentPreview } from "@/components/admin/StudentPreview";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardSubjectPill,
  panelLabel,
} from "@/components/card-styles";
import { formatCardDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CardInput } from "@/app/actions";
import { suggestCardFields } from "@/app/ai-actions";
import { applySuggestion } from "@/lib/card-suggestions";
import { applyCardStyles, FIELD_STYLES } from "@/lib/field-styles";
import { toPlainText } from "@/lib/inline-markup";
import { withIds } from "@/lib/sections";

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
  // A card written before the formatting toolbar existed has its styling in
  // the stylesheet rather than in its text. Seeding it here is what makes that
  // styling something the teacher can now change, and the first save writes it
  // out — no row is rewritten until she touches the card.
  const [values, setValues] = useState<CardInput>(() => {
    const styled = applyCardStyles({
      date: initialDate,
      subject: initialValues?.subject ?? "",
      usage: initialValues?.usage ?? "",
      englishPrompt: initialValues?.englishPrompt ?? "",
      hint: initialValues?.hint ?? "",
      frenchAnswer: initialValues?.frenchAnswer ?? "",
      sections: initialValues?.sections ?? [],
    });
    return { ...styled, sections: withIds(styled.sections) };
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
  // A timestamp rather than a boolean, so saving twice inside the window
  // restarts the five seconds instead of the second save being swallowed by
  // the first one's timer.
  const [savedAt, setSavedAt] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasSavedCard, setHasSavedCard] = useState(
    Boolean(initialValues?.englishPrompt && initialValues?.frenchAnswer),
  );

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

    setValues((prev) => {
      // Claude writes **bold** and nothing else, so its three fields arrive
      // unstyled — and so do the three the teacher typed at the compose stage,
      // which are plain inputs. This is where all six get their defaults.
      const next = applyCardStyles(applySuggestion(prev, result.suggestion));
      return { ...next, sections: withIds(next.sections) };
    });
    setStage("editing");
  }

  useEffect(() => {
    if (savedAt === 0) return;
    const timer = setTimeout(() => setSavedAt(0), 5000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // A contenteditable is not a form control, so `required` went away with
    // the textareas and the browser will not check these two for us.
    if (
      toPlainText(values.englishPrompt).trim() === "" ||
      toPlainText(values.frenchAnswer).trim() === ""
    ) {
      setError("The English sentence and the French answer are both needed.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      setHasSavedCard(true);
      setSavedAt(Date.now());
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
    setAiError(null);
    try {
      await onDelete(values.date);
      // Drop back to compose on the same date, blank. The teacher stays on
      // the day they were looking at, now ready to generate again.
      setValues({
        date: values.date,
        subject: "",
        usage: "",
        englishPrompt: "",
        hint: "",
        frenchAnswer: "",
        sections: [],
      });
      setHasSavedCard(false);
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
      <RichText
        value={values.subject}
        onChange={(v) => update("subject", v)}
        placeholder="Subject"
        ariaLabel="Subject"
        style={FIELD_STYLES.subject}
        className={cn(cardSubjectPill, "w-auto max-w-[45%] text-base text-right sm:text-[11px]")}
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
      // Same 560px wrapper as the page's other siblings: below lg this
      // centres like everything else, but above lg the page container is
      // 1152px, so without lg:mx-0 this block would float to the middle
      // instead of sharing the editor column's left edge.
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 lg:mx-0">
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
    // 1152 − 32 gap = 1120, halved = 560 — the form's mobile width.
    // This holds from viewport ≥ 1184px onward. Between lg (1024px)
    // and that threshold, columns scale proportionally narrower instead.
    <div className="mx-auto grid w-full max-w-[560px] gap-8 lg:max-w-[1152px] lg:grid-cols-2 lg:items-start">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div>
          <div className={panelLabel}>Front</div>
          <div className={cardPanel}>
            <span className={accentBarClass} style={accentBarStyle} />
            {cardHeader}
            <RichText
              value={values.usage}
              onChange={(v) => update("usage", v)}
              placeholder="Usage — e.g. Habits of the past"
              ariaLabel="Usage"
              style={FIELD_STYLES.usage}
              className="mb-1.5 font-[family-name:var(--card-font-serif)] text-base tracking-[0.3px] sm:text-xs"
            />
            <div className={cn("mb-2", cardEyebrow)}>Say it in French *</div>
            <RichText
              value={values.englishPrompt}
              onChange={(v) => update("englishPrompt", v)}
              placeholder="English sentence to translate"
              ariaLabel="English sentence to translate"
              multiline
              style={FIELD_STYLES.englishPrompt}
              className="font-[family-name:var(--card-font-serif)] text-2xl leading-snug"
            />
            <RichText
              value={values.hint}
              onChange={(v) => update("hint", v)}
              placeholder="Hint (optional)"
              ariaLabel="Hint"
              multiline
              style={FIELD_STYLES.hint}
              className="mt-4 font-[family-name:var(--card-font-serif)] text-base sm:text-sm"
            />
          </div>
        </div>

        <div>
          <div className={panelLabel}>Back</div>
          <div className={cardPanelBack}>
            <span className={accentBarClass} style={accentBarStyle} />
            {cardHeader}
            <div className={cn("mb-1", cardEyebrow)}>The answer *</div>
            <RichText
              value={values.frenchAnswer}
              onChange={(v) => update("frenchAnswer", v)}
              placeholder="French answer"
              ariaLabel="French answer"
              multiline
              style={FIELD_STYLES.frenchAnswer}
              className="mb-5 font-[family-name:var(--card-font-serif)] text-2xl leading-snug"
            />

            <SectionEditor
              sections={values.sections}
              onChange={(sections) => update("sections", sections)}
            />
          </div>
        </div>

        <Button type="submit" disabled={saving || deleting}>
          {saving ? "Saving..." : "Save card"}
        </Button>
        {onDelete &&
          hasSavedCard &&
          (confirmingDelete ? (
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-[var(--color-ink-muted)]">
                Delete this card?
              </span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving || deleting}
                className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
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
        {savedAt > 0 && !error && (
          <p
            role="status"
            className="text-center text-sm text-[var(--card-moss)]"
          >
            Card saved
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--color-accent)]">
            {error}
          </p>
        )}
      </form>

      <StudentPreview values={values} />
    </div>
  );
}
