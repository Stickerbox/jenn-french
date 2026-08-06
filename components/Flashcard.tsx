"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { CardContent } from "@/lib/card-resolution";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
import { CardFront } from "@/components/CardFront";
import { CardBack } from "@/components/CardBack";

export function Flashcard({
  card,
  locale,
}: {
  card: CardContent;
  // This is a client component, so it cannot call headers() itself — the
  // server component above it (app/g/[slug]/page.tsx) hands down the locale
  // rather than the resolved dictionary. See lib/strings.ts: a `Strings`
  // object holds ~105 functions and cannot cross the server/client boundary.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const [flipped, setFlipped] = useState(false);

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
          <CardFront
            card={card}
            strings={strings}
            locale={locale}
            className="col-start-1 row-start-1 [backface-visibility:hidden]"
          />
          <CardBack
            card={card}
            strings={strings}
            locale={locale}
            className="col-start-1 row-start-1 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          />
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
          {strings.common.card.flip}
        </button>
      </div>
    </div>
  );
}
