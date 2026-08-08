import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SummaryBullet } from "@/lib/student-summary";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";

// Copies Tile's structure rather than extending it, because the two differ in
// the one thing Tile's layout is built around: Tile is a row with its action
// opposite the title, and this is a card with a block of text under it.
//
// What is NOT changed is the link mechanism. The name is the anchor, stretched
// over the card with after:absolute after:inset-0, and the icons sit in a
// relative z-10 box above it — an anchor inside an anchor is invalid HTML that
// browsers repair by splitting the element. The focus ring is drawn on the card
// via has-[a:focus-visible] for the same reason Tile draws it there: an outline
// on the stretched anchor would ring the small name text, not the card.
export function StudentCard({
  href,
  name,
  bullets,
  footer,
  action,
  locale,
}: {
  href: string;
  name: string;
  bullets: SummaryBullet[];
  // The email and claim line, built by the caller because it already owns the
  // date formatting and the two claim states.
  footer?: ReactNode;
  action?: ReactNode;
  locale: Locale;
}) {
  const labels = getStrings(locale).admin.groups;

  // One place mapping a key to its sentence. summaryBullets owns the order and
  // this owns nothing but the words — the split lib/page-section-labels.ts
  // already makes.
  const say = (bullet: SummaryBullet): string => {
    switch (bullet.key) {
      case "unreadMessages":
        return labels.unreadCount(bullet.count);
      case "toCorrect":
        return labels.summaryToCorrect(bullet.count);
      case "started":
        return labels.summaryStarted(bullet.count);
      case "notOpened":
        return labels.summaryNotOpened(bullet.count);
      case "newFlashcards":
        return labels.summaryNewFlashcards(bullet.count);
      case "newFiles":
        return labels.summaryNewFiles(bullet.count);
      case "itemsDone":
        return labels.summaryItemsDone(bullet.count);
    }
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] px-5 py-4 shadow-[var(--card-shadow)] transition-opacity duration-150 hover:opacity-85 motion-reduce:transition-none",
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[var(--card-bleu)] has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[var(--card-paper)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <Link
          href={href}
          className="min-w-0 font-[family-name:var(--card-font-serif)] text-lg font-semibold text-[var(--card-ink)] after:absolute after:inset-0 focus-visible:outline-none"
        >
          {name}
        </Link>
        {action && <div className="relative z-10 shrink-0">{action}</div>}
      </div>

      {/* list-none with its own bullet glyph: a real list-disc marker sits
          outside the padding box and lines up with nothing else on the card. */}
      {bullets.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {bullets.map((bullet) => (
            <li
              key={bullet.key}
              className="flex gap-2 text-[13px] font-light leading-snug text-[var(--color-ink-muted)]"
            >
              <span aria-hidden>•</span>
              <span>{say(bullet)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] font-light text-[var(--color-ink-muted)]">
          {labels.summaryNothingNew}
        </p>
      )}

      {/* mt-auto so the footer sits on the card's floor. Cards in a row stretch
          to the tallest, and a claim line floating mid-card under a short
          bullet list reads as a layout fault. */}
      {footer && <div className="relative z-10 mt-auto pt-3">{footer}</div>}
    </div>
  );
}
