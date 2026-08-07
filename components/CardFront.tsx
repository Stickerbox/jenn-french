import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import type { Locale } from "@/lib/i18n";
import type { Strings } from "@/lib/strings";
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
  cardRevisionChip,
  cardSubjectPill,
} from "@/components/card-styles";

// `className` is how the caller supplies its own layout: the flip container
// passes backface and grid-cell classes, the admin preview passes a minimum
// height. Neither belongs to the face itself.
//
// `strings` is the whole dictionary, not just common.card, following the same
// convention components/student/* uses — this face renders on the student's
// own page AND inside the admin's StudentPreview, so it takes the full object
// rather than asking every caller to slice it first. `locale` is separate
// because formatCardDate needs a BCP-47 tag, not the dictionary.
export function CardFront({
  card,
  strings,
  locale,
  revision,
  className,
}: {
  card: CardContent;
  strings: Strings;
  locale: Locale;
  // This card is being shown again because nothing was posted today. A
  // PRESENTATION flag and deliberately not a field on CardContent: the card
  // itself is unchanged, and putting it on the content type would carry it
  // into the admin editor's form values, where it means nothing. Optional, so
  // StudentPreview and every other caller are untouched.
  revision?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(cardPanel, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className="flex items-baseline gap-2">
          <span className={cardDateLabel}>
            {formatCardDate(card.date, locale)}
          </span>
          {revision && (
            <span className={cardRevisionChip}>{strings.common.card.revision}</span>
          )}
        </span>
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
      <div className={cn("mb-2", cardEyebrow)}>
        {strings.common.card.sayItInFrench}
      </div>
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
        {strings.common.card.tapToReveal}
      </div>
    </div>
  );
}
