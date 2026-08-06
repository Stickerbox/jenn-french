import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import type { Locale } from "@/lib/i18n";
import type { Strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import { splitIdiom } from "@/lib/idiom";
import { isIdiomSection } from "@/lib/sections";
import { FIELD_STYLES } from "@/lib/field-styles";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanelBack,
  cardProse,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";

// The gold border and cream fill are the box, not the text — the teacher's
// colours apply to what she wrote inside it.
function IdiomBox({ body }: { body: string }) {
  const { expression, meaning } = splitIdiom(body);

  return (
    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
      {expression && (
        <div className="font-[family-name:var(--card-font-serif)] text-[19px] leading-snug">
          <InlineMarkup
            text={expression}
            style={FIELD_STYLES.idiomExpression}
          />
        </div>
      )}
      {meaning && (
        <div className="mt-1 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-[15px] leading-relaxed">
          <InlineMarkup text={meaning} style={FIELD_STYLES.idiomMeaning} />
        </div>
      )}
    </div>
  );
}

export function CardBack({
  card,
  strings,
  locale,
  className,
}: {
  card: CardContent;
  strings: Strings;
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={cn(cardPanelBack, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className={cardDateLabel}>{formatCardDate(card.date, locale)}</span>
        {card.subject && (
          <span className={cardSubjectPill}>
            <InlineMarkup text={card.subject} style={FIELD_STYLES.subject} />
          </span>
        )}
      </div>
      <div className={cn("mb-1", cardEyebrow)}>{strings.common.card.answer}</div>
      <p className="mb-5 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-2xl leading-snug">
        <InlineMarkup
          text={card.frenchAnswer}
          style={FIELD_STYLES.frenchAnswer}
        />
      </p>
      {card.sections
        .filter((section) => section.body.trim() !== "")
        .map((section, index) => (
          <div key={index} className="mb-4 last:mb-0">
            {section.title && (
              <h4 className={cardSectionHeading}>
                <InlineMarkup
                  text={section.title}
                  style={FIELD_STYLES.sectionTitle}
                />
              </h4>
            )}
            {isIdiomSection(section.title) ? (
              <IdiomBox body={section.body} />
            ) : (
              <p className={cardProse}>
                <InlineMarkup
                  text={section.body}
                  style={FIELD_STYLES.sectionBody}
                />
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
