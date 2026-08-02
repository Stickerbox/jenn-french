import { formatWeekRange } from "@/lib/week";

// The ⚜ eyebrow and the week range, which used to sit in the page header above
// everything. They moved here because the header said "the card of the day"
// over the files and board tabs too, which was simply wrong.
//
// This renders inside the CARD TAB'S BRANCH of the page body, not inside
// StudentTabs, and that placement is the whole decision:
//
//   - The tab strip only renders when a visitor has more than the card. An
//     untokened visitor has no strip at all and still needs this heading;
//     hanging it off the strip would delete it for exactly the person who has
//     nothing else on the page.
//   - The teacher has no card tab. Living in the card branch means she loses
//     this without a second rule anywhere saying so.
export function CardHeading({
  weekStart,
  weekEnd,
}: {
  weekStart: Date;
  weekEnd: Date;
}) {
  return (
    <div className="mx-auto mb-6 max-w-[560px] text-center">
      <div className="mb-2 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
        ⚜ La carte du jour ⚜
      </div>
      <div className="font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c]">
        {formatWeekRange(weekStart, weekEnd)}
      </div>
    </div>
  );
}
