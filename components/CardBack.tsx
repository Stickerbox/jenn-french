import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import { splitIdiom } from "@/lib/idiom";
import { isIdiomSection } from "@/lib/sections";
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

function IdiomBox({ body }: { body: string }) {
  const { expression, meaning } = splitIdiom(body);

  return (
    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
      {expression && (
        <div className="font-[family-name:var(--card-font-serif)] text-[19px] italic leading-snug text-[var(--card-rouge)]">
          <InlineMarkup text={expression} />
        </div>
      )}
      {meaning && (
        <div className="mt-1 whitespace-pre-line font-[family-name:var(--card-font-serif)] text-[15px] leading-relaxed text-[var(--card-ink)]">
          <InlineMarkup text={meaning} />
        </div>
      )}
    </div>
  );
}

export function CardBack({
  card,
  className,
}: {
  card: CardContent;
  className?: string;
}) {
  return (
    <div className={cn(cardPanelBack, className)}>
      <span className={accentBarClass} style={accentBarStyle} />
      <div className={cardHeaderRow}>
        <span className={cardDateLabel}>{formatCardDate(card.date)}</span>
        {card.subject && (
          <span className={cardSubjectPill}>{card.subject}</span>
        )}
      </div>
      <div className={cn("mb-1", cardEyebrow)}>The answer</div>
      <p className="mb-5 font-[family-name:var(--card-font-serif)] text-2xl leading-snug text-[var(--card-bleu)]">
        {card.frenchAnswer}
      </p>
      {card.sections
        .filter((section) => section.body.trim() !== "")
        .map((section, index) => (
          <div key={index} className="mb-4 last:mb-0">
            {section.title && (
              <h4 className={cardSectionHeading}>{section.title}</h4>
            )}
            {isIdiomSection(section.title) ? (
              <IdiomBox body={section.body} />
            ) : (
              <p className={cardProse}>
                <InlineMarkup text={section.body} />
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
