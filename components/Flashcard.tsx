"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { WordTag } from "@/components/WordTag";
import type { CardContent } from "@/lib/card-resolution";

export function Flashcard({ card }: { card: CardContent }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="mx-auto h-80 w-full max-w-md cursor-pointer [perspective:1200px]"
      onClick={() => setFlipped((value) => !value)}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)] [backface-visibility:hidden]">
          <h1 className="font-[var(--font-display)] text-5xl italic text-[var(--color-ink)]">
            {card.frenchWord}
          </h1>
          <p className="font-[var(--font-body)] text-lg text-[var(--color-ink-muted)]">
            {card.englishPrompt}
          </p>
          {card.wordType && <WordTag label={card.wordType} />}
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            {card.frenchAnswer}
          </p>
          {card.examples && (
            <p className="whitespace-pre-line font-[var(--font-body)] text-sm text-[var(--color-ink-muted)]">
              {card.examples}
            </p>
          )}
          {card.pronunciation && (
            <p className="font-[var(--font-body)] text-xs text-[var(--color-ink-muted)]">
              {card.pronunciation}
            </p>
          )}
          {card.tip && <WordTag label={card.tip} />}
        </div>
      </motion.div>
    </div>
  );
}
