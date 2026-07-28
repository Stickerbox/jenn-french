import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardSubjectPill,
} from "@/components/card-styles";

// `className` is how the caller supplies its own layout: the flip container
// passes backface and grid-cell classes, the admin preview passes a minimum
// height. Neither belongs to the face itself.
export function CardFront({
  card,
  className,
}: {
  card: CardContent;
  className?: string;
}) {
  return (
    <div className={cn(cardPanel, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className={cardDateLabel}>{formatCardDate(card.date)}</span>
        {card.subject && (
          <span className={cardSubjectPill}>{card.subject}</span>
        )}
      </div>
      {card.usage && (
        <div className="mb-1.5 font-[family-name:var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]">
          {card.usage}
        </div>
      )}
      <div className={cn("mb-2", cardEyebrow)}>Say it in French</div>
      <div className="flex-1">
        <p className="font-[family-name:var(--card-font-serif)] text-2xl leading-snug text-[var(--card-ink)]">
          {card.englishPrompt}
        </p>
        {card.hint && (
          <p className="mt-4 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
            <InlineMarkup text={card.hint} />
          </p>
        )}
      </div>
      <div className="mt-4 text-center font-[family-name:var(--card-font-serif)] text-xs italic text-[#b0a488]">
        tap to reveal the answer
      </div>
    </div>
  );
}
