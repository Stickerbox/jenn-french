"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";
import { cn } from "@/lib/utils";
import { InlineMarkup } from "@/components/InlineMarkup";
import { splitIdiom } from "@/lib/idiom";
import { isExpressionBody } from "@/lib/sections";
import {
  accentBarClass,
  accentBarStyle,
  cardDateLabel,
  cardEyebrow,
  cardHeaderRow,
  cardPanel,
  cardPanelBack,
  cardProse,
  cardSectionHeading,
  cardSubjectPill,
} from "@/components/card-styles";

const accentBar = <span className={accentBarClass} style={accentBarStyle} />;

export function Flashcard({ card }: { card: CardContent }) {
  const [flipped, setFlipped] = useState(false);
  const dateLabel = formatCardDate(card.date);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div
        className="relative w-full cursor-pointer [perspective:2000px]"
        onClick={() => setFlipped((value) => !value)}
      >
        <motion.div
          className="grid min-h-[460px] w-full grid-cols-1"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0.15, 0.2, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className={cn(cardPanel, "col-start-1 row-start-1 [backface-visibility:hidden]")}>
            {accentBar}
            <div className={cardHeaderRow}>
              <span className={cardDateLabel}>
                {dateLabel}
              </span>
              {card.subject && (
                <span className={cardSubjectPill}>
                  {card.subject}
                </span>
              )}
            </div>
            {card.usage && (
              <div className="mb-1.5 font-[family-name:var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]">
                {card.usage}
              </div>
            )}
            <div className={cn("mb-2", cardEyebrow)}>
              Say it in French
            </div>
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

          <div
            className={cn(
              cardPanelBack,
              "col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]",
            )}
          >
            {accentBar}
            <div className={cardHeaderRow}>
              <span className={cardDateLabel}>
                {dateLabel}
              </span>
              {card.subject && (
                <span className={cardSubjectPill}>
                  {card.subject}
                </span>
              )}
            </div>
            <div className={cn("mb-1", cardEyebrow)}>
              The answer
            </div>
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
                  {isExpressionBody(section.body) ? (
                    <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
                      {(() => {
                        const { expression, meaning } = splitIdiom(section.body);
                        return (
                          <>
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
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className={cardProse}>
                      <InlineMarkup text={section.body} />
                    </p>
                  )}
                </div>
              ))}
          </div>
        </motion.div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={(event) => {
            event.stopPropagation();
            setFlipped((value) => !value);
          }}
          className="rounded-full border border-[var(--card-bleu)] bg-[var(--card-bleu)] px-6 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-colors hover:bg-[#0d3f6b]"
        >
          Flip card
        </button>
      </div>
    </div>
  );
}
