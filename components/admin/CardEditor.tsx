"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  cardFieldSkin,
  cardFocusRing,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardSubjectPill,
  formErrorText,
  panelLabel,
} from "@/components/card-styles";
import { formatCardDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
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
  datePicker,
  onSubmit,
  onDelete,
  locale,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  // The date picker is rendered here rather than beside this component
  // because where it belongs depends on the stage: the compose step is one
  // centred column, the editing step is a two-column grid whose left edge it
  // has to share. Only the stage knows which, and the stage lives in here.
  datePicker?: ReactNode;
  onSubmit: (input: CardInput) => Promise<void>;
  onDelete?: (date: string) => Promise<void>;
  // This is a client component reached directly from app/admin/page.tsx, so
  // it takes `locale` rather than the resolved `strings` object — a
  // `Strings` value holds functions and cannot cross that boundary. See
  // lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.cardEditor;
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
      setAiError(strings.admin.cardAi.unreachable);
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
      setError(labels.requiredFields);
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
      setError(err instanceof Error ? err.message : strings.admin.genericError);
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
      setError(err instanceof Error ? err.message : labels.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  const dateLabel = values.date
    ? formatCardDate(new Date(`${values.date}T00:00:00Z`), locale)
    : "—";

  const cardHeader = (
    <div className={cardHeaderRow}>
      <span className={cardDateLabel}>{dateLabel}</span>
      <RichText
        value={values.subject}
        onChange={(v) => update("subject", v)}
        placeholder={labels.subjectPillLabel}
        ariaLabel={labels.subjectPillLabel}
        style={FIELD_STYLES.subject}
        locale={locale}
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
      // Centred at every width, matching the Students and Pages tabs. There is
      // no two-column grid at this stage, so nothing here has a left edge to
      // share — that constraint only arrives once the card exists.
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        {datePicker}

        <label className="text-sm font-medium text-[var(--card-ink)]">
          {labels.englishPhraseLabel}
          {/* The example text stays literally English — it demonstrates what
              this field holds (an English sentence), not a UI instruction, so
              it is not part of the dictionary and does not follow locale. */}
          <Input
            value={values.englishPrompt}
            onChange={(e) => update("englishPrompt", e.target.value)}
            placeholder="I used to pack a lunch every day"
            disabled={busy}
            required
            className={cardFieldSkin}
          />
        </label>

        <label className="text-sm font-medium text-[var(--card-ink)]">
          {labels.frenchPhraseLabel}
          {/* Same reasoning as above, in reverse: this field holds a French
              sentence, so its example stays French regardless of locale. */}
          <Input
            value={values.frenchAnswer}
            onChange={(e) => update("frenchAnswer", e.target.value)}
            placeholder="Je faisais un lunch chaque jour"
            disabled={busy}
            required
            className={cardFieldSkin}
          />
        </label>

        <label className="text-sm font-medium text-[var(--card-ink)]">
          {labels.subjectLabel}
          {/* "Imparfait" is the grammar term itself, not UI chrome — it names
              what the subject field commonly holds and stays fixed for the
              same reason the two examples above do. */}
          <Input
            value={values.subject}
            onChange={(e) => update("subject", e.target.value)}
            placeholder="Imparfait"
            disabled={busy}
            required
            className={cardFieldSkin}
          />
        </label>

        <Button type="button" onClick={handleGenerate} disabled={!ready || busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
              {labels.generating}
            </span>
          ) : (
            labels.generate
          )}
        </Button>

        {aiError && (
          // card-rouge, not the accent: since Task F, --color-accent is the
          // lilac wordmark colour, not a colour that reads as "something went
          // wrong". card-rouge is the card palette's own error token, already
          // used this way in StudentAuthPanel. formErrorText is the same
          // treatment every other form's alert uses.
          <p role="alert" className={formErrorText}>
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
        {/* Inside the form rather than above the grid: that puts the picker in
            the left column, so it shares the editor's edge at every width
            without a breakpoint override. Every control it renders is a
            type="button", so it cannot submit this form. */}
        {datePicker}

        <div>
          <div className={panelLabel}>{labels.front}</div>
          <div className={cardPanel}>
            <span className={accentBarClass} style={accentBarStyle} />
            {cardHeader}
            <RichText
              value={values.usage}
              onChange={(v) => update("usage", v)}
              placeholder={labels.usagePlaceholder}
              ariaLabel={labels.usageAriaLabel}
              style={FIELD_STYLES.usage}
              locale={locale}
              className="mb-1.5 font-[family-name:var(--card-font-serif)] text-base tracking-[0.3px] sm:text-xs"
            />
            <div className={cn("mb-2", cardEyebrow)}>
              {labels.sayItInFrenchRequired}
            </div>
            <RichText
              value={values.englishPrompt}
              onChange={(v) => update("englishPrompt", v)}
              placeholder={labels.englishSentence}
              ariaLabel={labels.englishSentence}
              multiline
              style={FIELD_STYLES.englishPrompt}
              locale={locale}
              className="font-[family-name:var(--card-font-serif)] text-2xl leading-snug"
            />
            <RichText
              value={values.hint}
              onChange={(v) => update("hint", v)}
              placeholder={labels.hintPlaceholder}
              ariaLabel={labels.hintAriaLabel}
              multiline
              style={FIELD_STYLES.hint}
              locale={locale}
              className="mt-4 font-[family-name:var(--card-font-serif)] text-base sm:text-sm"
            />
          </div>
        </div>

        <div>
          <div className={panelLabel}>{labels.back}</div>
          <div className={cardPanelBack}>
            <span className={accentBarClass} style={accentBarStyle} />
            {cardHeader}
            <div className={cn("mb-1", cardEyebrow)}>
              {labels.theAnswerRequired}
            </div>
            <RichText
              value={values.frenchAnswer}
              onChange={(v) => update("frenchAnswer", v)}
              placeholder={labels.frenchAnswer}
              ariaLabel={labels.frenchAnswer}
              multiline
              style={FIELD_STYLES.frenchAnswer}
              locale={locale}
              className="mb-5 font-[family-name:var(--card-font-serif)] text-2xl leading-snug"
            />

            <SectionEditor
              sections={values.sections}
              onChange={(sections) => update("sections", sections)}
              locale={locale}
            />
          </div>
        </div>

        <Button type="submit" disabled={saving || deleting}>
          {saving ? strings.common.saving : labels.saveCard}
        </Button>
        {onDelete &&
          hasSavedCard &&
          (confirmingDelete ? (
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-[var(--color-ink-muted)]">
                {labels.deleteConfirm}
              </span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving || deleting}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded px-1 text-[var(--color-ink-muted)] underline transition-opacity duration-150 motion-reduce:transition-none disabled:opacity-50",
                  cardFocusRing,
                )}
              >
                {strings.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded px-1 font-medium text-[var(--card-rouge)] underline transition-opacity duration-150 motion-reduce:transition-none disabled:opacity-50",
                  cardFocusRing,
                )}
              >
                {deleting ? strings.common.deleting : strings.common.delete}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={cn(
                "mx-auto inline-flex min-h-[44px] items-center rounded px-1 text-sm text-[var(--color-ink-muted)] underline transition-opacity duration-150 motion-reduce:transition-none",
                cardFocusRing,
              )}
            >
              {labels.deleteCard}
            </button>
          ))}
        {savedAt > 0 && !error && (
          <p
            role="status"
            className="text-center text-sm text-[var(--card-moss)]"
          >
            {labels.cardSaved}
          </p>
        )}
        {error && (
          <p role="alert" className={formErrorText}>
            {error}
          </p>
        )}
      </form>

      <StudentPreview values={values} strings={strings} locale={locale} />
    </div>
  );
}
