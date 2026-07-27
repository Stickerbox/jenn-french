"use client";

import { EditableText } from "@/components/admin/EditableText";
import { cardSectionHeading } from "@/components/card-styles";
import { moveSection, type CardSection } from "@/lib/sections";
import { cn } from "@/lib/utils";

const controlClass =
  "px-1.5 text-xs text-[var(--color-ink-muted)] transition-opacity hover:opacity-70 disabled:opacity-25";

export function SectionEditor({
  sections,
  onChange,
}: {
  sections: CardSection[];
  onChange: (sections: CardSection[]) => void;
}) {
  // The trailing entry is the placeholder. It lives in the rendered list but
  // not in `sections`, so it cannot be saved and cannot be reordered; typing
  // into it appends a real section and a fresh placeholder takes its place.
  const rows = [...sections, { title: "", body: "" }];

  function update(index: number, patch: Partial<CardSection>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    // Drop a trailing placeholder the teacher has not touched.
    const last = next[next.length - 1];
    if (last.title === "" && last.body === "") next.pop();
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((section, index) => {
        const isPlaceholder = index === sections.length;

        return (
          <div
            key={index}
            className={cn(
              "rounded-lg p-3",
              isPlaceholder &&
                "border border-dashed border-[var(--card-rouge)]/60",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <EditableText
                value={section.title}
                onChange={(v) => update(index, { title: v })}
                placeholder={isPlaceholder ? "Add new section" : "Section title"}
                ariaLabel={
                  isPlaceholder ? "New section title" : `${section.title} title`
                }
                className={cn(cardSectionHeading, "mb-0")}
              />

              {!isPlaceholder && (
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={`Move ${section.title} up`}
                    disabled={index === 0}
                    onClick={() => onChange(moveSection(sections, index, -1))}
                    className={controlClass}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${section.title} down`}
                    disabled={index === sections.length - 1}
                    onClick={() => onChange(moveSection(sections, index, 1))}
                    className={controlClass}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${section.title}`}
                    onClick={() =>
                      onChange(sections.filter((_, i) => i !== index))
                    }
                    className={controlClass}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <EditableText
              value={section.body}
              onChange={(v) => update(index, { body: v })}
              placeholder={isPlaceholder ? "" : "Section text"}
              ariaLabel={
                isPlaceholder ? "New section text" : `${section.title} text`
              }
              multiline
              className="text-[15px] leading-relaxed text-[var(--card-ink)]"
            />
          </div>
        );
      })}
    </div>
  );
}
