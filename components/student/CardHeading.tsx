import { currentStrings } from "@/lib/locale";

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
//
// A server component reading its own locale rather than taking a prop: it has
// no state and no other reason to exist as anything but a leaf, so there is
// nothing gained by threading a value through app/g/[slug]/page.tsx that this
// can read for itself.
export async function CardHeading() {
  const { student } = await currentStrings();

  return (
    // mb-[var(--space-4)]: 24px, one step tighter than the --space-5 (32px)
    // gap between the page's own major zones (header, tab strip, date nav) —
    // this eyebrow belongs to the date nav directly below it, not to a zone
    // of its own, so it earns the smaller of the two named gaps rather than
    // the same one repeated for a different reason.
    <div className="mx-auto mb-[var(--space-4)] max-w-[560px] text-center">
      <div className="font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
        {student.card.eyebrow}
      </div>
    </div>
  );
}
