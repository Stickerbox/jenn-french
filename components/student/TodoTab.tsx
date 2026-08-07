"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fieldClassName } from "@/components/ui/field";
import { cardFocusRing, emptyStateText, formErrorText } from "@/components/card-styles";
import { getStrings } from "@/lib/strings";
import { MAX_ITEM_TEXT } from "@/lib/deck-limits";
import type { Locale } from "@/lib/i18n";
import type { ActionItemRow } from "@/lib/action-items";
import { cn } from "@/lib/utils";

export function TodoTab({
  items,
  studentName,
  locale,
  onAdd,
  onSetDone,
  onDelete,
}: {
  items: ActionItemRow[];
  // The student whose page this is. Needed because the list is SHARED and both
  // parties read it: a relative label like "Me" would be a lie to whichever of
  // them is not the one who added the row.
  studentName: string;
  // See lib/strings.ts: the locale crosses, the dictionary does not.
  locale: Locale;
  onAdd: (text: string) => Promise<void>;
  onSetDone: (id: string, done: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const strings = getStrings(locale);
  const t = strings.student.todo;
  const router = useRouter();

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ids the reader has just ticked or unticked, held until the server catches
  // up. Optimistic: a checkbox that waited for a round trip before moving
  // feels broken on a phone.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd(text);
      setText("");
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, done: boolean) {
    setPending((current) => ({ ...current, [id]: done }));
    setError(null);
    try {
      await onSetDone(id, done);
      router.refresh();
    } catch {
      // Put the row back where it was. An optimistic update that silently
      // stuck would tell the reader an item is done when the server disagrees.
      setPending((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setError(t.error);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await onDelete(id);
      router.refresh();
    } catch {
      setError(t.error);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {items.length === 0 ? (
        <p className={emptyStateText}>{t.empty}</p>
      ) : (
        <ul className="mb-5 flex flex-col gap-1">
          {items.map((item) => {
            // The pending value wins while a write is in flight, so the row
            // moves the moment it is pressed.
            const done = pending[item.id] ?? item.doneAt !== null;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--card-line)] bg-[var(--card-paper)] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => void toggle(item.id, !done)}
                  aria-label={t.toggle(item.text)}
                  className={cn("h-5 w-5 shrink-0 accent-[var(--card-bleu)]", cardFocusRing)}
                />

                {/* Struck through IN PLACE. A row that jumped to the bottom the
                    instant it was ticked would make an accidental tick hard to
                    undo, because the row you meant to press is no longer where
                    you pressed. */}
                <span
                  className={cn(
                    "min-w-0 flex-1 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]",
                    done && "text-[var(--card-moss)] line-through opacity-70",
                  )}
                >
                  {item.text}
                </span>

                {/* Text, not a colour or an icon: a shared list where you
                    cannot tell who set an item is the thing fromTeacher exists
                    to prevent, and a colour alone says nothing to a screen
                    reader.

                    NAMES, never "me". Both parties read this same list, so a
                    viewer-relative label would tell Jenn that a row the student
                    added was her own. */}
                <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                  {item.fromTeacher ? t.byTeacher : studentName}
                </span>

                {/* No confirmation, matching the link tile's own delete: an
                    item is one line of text and re-adding it is retyping it.
                    The flashcard's trash DOES confirm — a card is two fields
                    and a note. */}
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  aria-label={t.delete(item.text)}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--card-moss)] transition-colors duration-150 hover:text-[var(--card-rouge)] motion-reduce:transition-none",
                    cardFocusRing,
                  )}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Always visible, at the foot of the list. No FAB and no sheet: the
          request was "easy to add another item", and a two-gesture flow
          through a modal is not that. */}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.addPlaceholder}
          aria-label={t.addPlaceholder}
          // The courtesy; the action is the authority.
          maxLength={MAX_ITEM_TEXT}
          className={cn(fieldClassName, "mt-0 flex-1")}
        />
        <button
          type="submit"
          disabled={saving || text.trim() === ""}
          className={cn(
            "min-h-[44px] shrink-0 rounded-full bg-[var(--card-bleu)] px-5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none",
            cardFocusRing,
          )}
        >
          {t.add}
        </button>
      </form>

      {error && (
        <p role="alert" className={cn("mt-3", formErrorText)}>
          {error}
        </p>
      )}
    </div>
  );
}
