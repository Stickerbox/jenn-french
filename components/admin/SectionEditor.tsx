"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RichText } from "@/components/admin/RichText";
import { cardSectionHeading } from "@/components/card-styles";
import { FIELD_STYLES } from "@/lib/field-styles";
import { toPlainText } from "@/lib/inline-markup";
import { moveSection, type CardSection } from "@/lib/sections";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 44px square: the controls sit side by side on a phone, and the one on the
// end deletes. At the previous 24x18 a thumb aiming for the down arrow could
// land on it instead.
const controlClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm " +
  "text-[var(--color-ink-muted)] transition-colors " +
  "hover:bg-[var(--card-line)]/30 disabled:opacity-25 disabled:hover:bg-transparent";

export function SectionEditor({
  sections,
  onChange,
  locale,
}: {
  sections: CardSection[];
  onChange: (sections: CardSection[]) => void;
  // This is a client component reached directly from CardEditor, so it takes
  // `locale` rather than the resolved `strings` object — a `Strings` value
  // holds functions and cannot cross that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.sectionEditor;
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  // The placeholder gets its id before it holds anything. Minting it on the
  // first keystroke instead would change the row's React key at that exact
  // moment, remounting the input and dropping focus mid-word. The prefix keeps
  // it clear of withIds' positional "s-N" ids from the database.
  const [placeholderSeq, setPlaceholderSeq] = useState(0);
  const placeholderId = `new-${placeholderSeq}`;

  // The trailing entry is the placeholder. It lives in the rendered list but
  // not in `sections`, so it cannot be saved and cannot be reordered; typing
  // into it appends a real section and a fresh placeholder takes its place.
  const rows = [...sections, { title: "", body: "", id: placeholderId }];

  function update(index: number, patch: Partial<CardSection>) {
    const next = rows.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    );
    const last = next[next.length - 1];
    if (last.title === "" && last.body === "") {
      // Drop a trailing placeholder the teacher has not touched.
      next.pop();
    } else {
      // The placeholder just became real and kept its id, so the next one
      // needs a fresh key of its own.
      setPlaceholderSeq((n) => n + 1);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((section, index) => {
        const isPlaceholder = index === sections.length;
        // An untitled section is a supported state, and without this the
        // controls announce as "Move  up" and "Delete " to a screen reader.
        // Plain text, or a screen reader would read the markers out too.
        const label = toPlainText(section.title).trim() || labels.untitled;

        return (
          <motion.div
            key={section.id}
            layout="position"
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "rounded-xl p-4",
              // A filled panel for a section that holds something, an outlined
              // one for the empty slot — so "written" and "not yet written"
              // are distinguishable at a glance.
              isPlaceholder
                ? "border border-dashed border-[var(--card-rouge)]/60"
                : "bg-[var(--card-section)]",
            )}
          >
            {/* The controls sit on their own row above the title. Sharing a
                flex row with it meant three 44px buttons competed with the
                input, and on a phone the title was clipped as she typed. */}
            {!isPlaceholder && (
              <div className="mb-1 flex min-h-[44px] items-center justify-end gap-2">
                {confirmingDelete === index ? (
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="text-[var(--color-ink-muted)]">
                      {labels.deleteConfirm}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="flex h-11 items-center px-2 text-[var(--color-ink-muted)] underline"
                    >
                      {strings.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(sections.filter((_, i) => i !== index));
                        setConfirmingDelete(null);
                      }}
                      className="flex h-11 items-center px-2 font-medium text-[var(--card-rouge)] underline"
                    >
                      {strings.common.delete}
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={labels.moveUpAria(label)}
                      disabled={index === 0}
                      onClick={() => onChange(moveSection(sections, index, -1))}
                      className={controlClass}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={labels.moveDownAria(label)}
                      disabled={index === sections.length - 1}
                      onClick={() => onChange(moveSection(sections, index, 1))}
                      className={controlClass}
                    >
                      ↓
                    </button>
                    {/* Separated from the arrows: this one is destructive and
                        sits where a thumb overshooting the down arrow lands. */}
                    <button
                      type="button"
                      aria-label={labels.deleteAria(label)}
                      onClick={() => setConfirmingDelete(index)}
                      className={cn(controlClass, "ml-2")}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            <RichText
              value={section.title}
              onChange={(v) => update(index, { title: v })}
              placeholder={isPlaceholder ? labels.addNew : labels.titlePlaceholder}
              ariaLabel={isPlaceholder ? labels.newTitleAria : labels.titleAria(label)}
              style={FIELD_STYLES.sectionTitle}
              locale={locale}
              className={cn(cardSectionHeading, "mb-1 text-base sm:text-[13px]")}
            />

            {/* Every body gets the plain default, the idiom's included. Its
                two-part red-and-black seeding only makes sense for the shape
                Claude produces, which applySectionStyles handles on load. */}
            <RichText
              value={section.body}
              onChange={(v) => update(index, { body: v })}
              placeholder={isPlaceholder ? "" : labels.textPlaceholder}
              ariaLabel={isPlaceholder ? labels.newTextAria : labels.textAria(label)}
              multiline
              style={FIELD_STYLES.sectionBody}
              locale={locale}
              className="text-base leading-relaxed sm:text-[15px]"
            />
          </motion.div>
        );
      })}
    </div>
  );
}
