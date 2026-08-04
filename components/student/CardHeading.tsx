// The ⚜ eyebrow. The week range that used to sit under it moved to
// CardDateNav, which owns every date control on this tab: the range is the
// SELECTED week now and doubles as the button that opens the calendar, and
// neither of those is a static server-rendered line.
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
export function CardHeading() {
  return (
    <div className="mx-auto mb-6 max-w-[560px] text-center">
      <div className="font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
        ⚜ La carte du jour ⚜
      </div>
    </div>
  );
}
