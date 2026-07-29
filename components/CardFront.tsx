import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import { FIELD_STYLES } from "@/lib/field-styles";
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
          <span className={cardSubjectPill}>
            <InlineMarkup text={card.subject} style={FIELD_STYLES.subject} />
          </span>
        )}
      </div>
      {card.usage && (
        <div className="mb-1.5 font-[family-name:var(--card-font-serif)] text-xs tracking-[0.3px]">
          <InlineMarkup text={card.usage} style={FIELD_STYLES.usage} />
        </div>
      )}
      <div className={cn("mb-2", cardEyebrow)}>Say it in French</div>
      <div className="flex-1">
        <p className="whitespace-pre-line font-[family-name:var(--card-font-serif)] text-2xl leading-snug">
          <InlineMarkup
            text={card.englishPrompt}
            style={FIELD_STYLES.englishPrompt}
          />
        </p>
        {card.hint && (
          <p className="mt-4 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-sm">
            <InlineMarkup text={card.hint} style={FIELD_STYLES.hint} />
          </p>
        )}
      </div>
      <div className="mt-4 text-center font-[family-name:var(--card-font-serif)] text-xs italic text-[#b0a488]">
        tap to reveal the answer
      </div>
    </div>
  );
}
