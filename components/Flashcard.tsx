"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { formatCardDate } from "@/lib/format";
import type { CardContent } from "@/lib/card-resolution";

const accentBar = (
  <span
    className="absolute inset-y-0 left-0 w-1.5 rounded-l-[14px]"
    style={{ background: "linear-gradient(var(--card-bleu), var(--card-or))" }}
  />
);

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
          <div className="relative col-start-1 row-start-1 flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] p-8 shadow-[var(--card-shadow)] [backface-visibility:hidden]">
            {accentBar}
            <div className="mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--card-line)] pb-3">
              <span className="font-[var(--card-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]">
                {dateLabel}
              </span>
              {card.subject && (
                <span className="rounded-full bg-[var(--card-bleu-soft)] px-2.5 py-1 text-[11px] uppercase tracking-wide text-[var(--card-bleu)]">
                  {card.subject}
                </span>
              )}
            </div>
            {card.usage && (
              <div className="mb-1.5 font-[var(--card-font-serif)] text-xs italic tracking-[0.3px] text-[var(--card-or)]">
                {card.usage}
              </div>
            )}
            <div className="mb-2 font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#a89a7f]">
              Say it in French
            </div>
            <div className="flex-1">
              <p className="font-[var(--card-font-serif)] text-xl leading-relaxed text-[var(--card-ink)]">
                {card.englishPrompt}
              </p>
              {card.hint && (
                <p className="mt-4 font-[var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
                  {card.hint}
                </p>
              )}
            </div>
            <div className="mt-4 text-center font-[var(--card-font-serif)] text-xs italic text-[#b0a488]">
              tap to reveal the answer
            </div>
          </div>

          <div className="relative col-start-1 row-start-1 flex flex-col rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper-back)] p-8 shadow-[var(--card-shadow)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {accentBar}
            <div className="mb-4 flex items-baseline justify-between border-b border-dashed border-[var(--card-line)] pb-3">
              <span className="font-[var(--card-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]">
                {dateLabel}
              </span>
              {card.subject && (
                <span className="rounded-full bg-[var(--card-bleu-soft)] px-2.5 py-1 text-[11px] uppercase tracking-wide text-[var(--card-bleu)]">
                  {card.subject}
                </span>
              )}
            </div>
            <div className="mb-1 font-[var(--card-font-mono)] text-[11px] uppercase tracking-[2px] text-[#a89a7f]">
              The answer
            </div>
            <p className="mb-5 font-[var(--card-font-serif)] text-2xl leading-snug text-[var(--card-bleu)]">
              {card.frenchAnswer}
            </p>
            {card.examples && (
              <div className="mb-4">
                <h4 className="mb-1.5 font-[var(--card-font-mono)] text-[11px] uppercase tracking-wider text-[var(--card-rouge)]">
                  Grammar
                </h4>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-[var(--card-ink)]">
                  {card.examples}
                </p>
              </div>
            )}
            {card.pronunciation && (
              <div className="mb-4">
                <h4 className="mb-1.5 font-[var(--card-font-mono)] text-[11px] uppercase tracking-wider text-[var(--card-rouge)]">
                  Québec Pronunciation
                </h4>
                <span className="rounded bg-[#eef3ee] px-1.5 py-0.5 font-[var(--card-font-mono)] text-[13px] text-[var(--card-moss)]">
                  {card.pronunciation}
                </span>
              </div>
            )}
            {card.tip && (
              <div className="mb-4">
                <h4 className="mb-1.5 font-[var(--card-font-mono)] text-[11px] uppercase tracking-wider text-[var(--card-rouge)]">
                  Tip
                </h4>
                <p className="text-[15px] leading-relaxed text-[var(--card-ink)]">
                  {card.tip}
                </p>
              </div>
            )}
            {card.idiom && (
              <div>
                <h4 className="mb-1.5 font-[var(--card-font-mono)] text-[11px] uppercase tracking-wider text-[var(--card-rouge)]">
                  Idiom of the day
                </h4>
                <div className="rounded-r-lg border-l-[3px] border-[var(--card-or)] bg-[#fbf1e2] p-3.5">
                  <div className="whitespace-pre-line text-[15px] italic text-[var(--card-rouge)]">
                    {card.idiom}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={(event) => {
            event.stopPropagation();
            setFlipped((value) => !value);
          }}
          className="rounded-full border border-[var(--card-bleu)] bg-[var(--card-bleu)] px-6 py-2.5 font-[var(--card-font-serif)] text-sm text-white transition-colors hover:bg-[#0d3f6b]"
        >
          Flip card
        </button>
      </div>
    </div>
  );
}
