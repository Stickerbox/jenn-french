"use client";

import Link from "next/link";
import { useStream } from "@/components/StreamProvider";

// A banner rather than an auto-switch, because yanking the page out from under
// someone mid-sentence is worse than a button — and rather than nothing,
// because a missed verbal instruction means drawing to an empty room.
export function LiveBanner({ slug }: { slug: string }) {
  const { board } = useStream();
  if (!board) return null;

  return (
    <div className="mx-auto mb-6 flex max-w-[560px] items-center justify-between gap-3 rounded-xl border border-[var(--card-line)] bg-[var(--card-bleu-soft)] px-4 py-3">
      <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)]">
        Jenn dessine en ce moment
      </span>
      <Link
        href={`/g/${slug}?tab=board`}
        className="rounded-full bg-[var(--card-bleu)] px-4 py-1.5 text-sm text-white"
      >
        Ouvrir le tableau
      </Link>
    </div>
  );
}
