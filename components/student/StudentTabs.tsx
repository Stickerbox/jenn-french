import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentTab } from "@/lib/student-tab";
import { currentStrings } from "@/lib/locale";
import { cardFocusRing } from "@/components/card-styles";
import { UnseenDot } from "@/components/ui/UnseenDot";

// Mirrors /admin's strip so both halves of the site work the same way, in the
// flashcard palette rather than the admin one.
//
// A server component reading its own locale rather than taking a prop, the
// same choice CardHeading makes and for the same reason: no state, nothing
// else to thread a value through app/g/[slug]/page.tsx for.
export async function StudentTabs({
  slug,
  active,
  date,
  has,
  dots,
}: {
  slug: string;
  active: StudentTab;
  date: string;
  has: {
    card: boolean;
    files: boolean;
    board: boolean;
    deck: boolean;
    todo: boolean;
  };
  // Only the three surfaces that carry a watermark. The card is the same
  // global card for everyone and a board is Jenn's to draw, so neither has an
  // "other party added this" to report.
  dots: { files: boolean; deck: boolean; todo: boolean };
}) {
  const { student } = await currentStrings();

  const tabs: {
    tab: StudentTab;
    label: string;
    href: string;
    dot: boolean;
  }[] = [
    ...(has.card
      ? [{ tab: "card" as const, label: student.tabs.card, href: `/g/${slug}?date=${date}`, dot: false }]
      : []),
    ...(has.files
      ? [{ tab: "files" as const, label: student.tabs.files, href: `/g/${slug}?tab=files`, dot: dots.files }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: student.tabs.board, href: `/g/${slug}?tab=board`, dot: false }]
      : []),
    ...(has.deck
      ? [{ tab: "deck" as const, label: student.tabs.deck, href: `/g/${slug}?tab=deck`, dot: dots.deck }]
      : []),
    ...(has.todo
      ? [{ tab: "todo" as const, label: student.tabs.todo, href: `/g/${slug}?tab=todo`, dot: dots.todo }]
      : []),
  ];

  return (
    <nav
      aria-label={student.tabs.sectionsLabel}
      // mb-[var(--space-5)]: same 32px as the header above it
      // (app/g/[slug]/page.tsx) and the date nav below it (CardDateNav), so
      // the page's three major seams share one gap rather than three numbers
      // that happened to be close.
      // SCROLLS RATHER THAN SQUASHING. Three tabs fit a phone and five do not:
      // the French labels are roughly 380px of text before padding, inside a
      // strip that is the first thing on this page. A strip that shrank its
      // padding to fit would look correct and be unusable — the same reason
      // ShellBar's middle track scrolls rather than compressing three French
      // version labels.
      //
      // Centring is `mx-auto` ON THE CHILD below, and deliberately NOT
      // `justify-center` here. Combining justify-center with overflow-x-auto
      // is a known trap: when the content is wider than the box, flexbox
      // centres the overflow, so BOTH ends are clipped and scrollLeft starts
      // in the middle — the reader has to scroll two directions to reach
      // either end. Auto margins centre when there is room and collapse to
      // zero when there is not, at every width, which also removes the need
      // to guess with a breakpoint whether five labels happen to fit.
      className="mx-auto mb-[var(--space-5)] flex max-w-[560px] overflow-x-auto"
    >
      <div className="mx-auto flex w-max shrink-0 gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
        {tabs.map(({ tab, label, href, dot }) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              // min-h-[44px] flex-centred rather than a bigger py-2: the pill
              // stays the same visual height, the tap target underneath it
              // does not.
              "flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors duration-150 motion-reduce:transition-none",
              tab === active
                ? "bg-[var(--card-bleu)] text-white"
                : "text-[var(--card-moss)] hover:text-[var(--card-bleu)]",
              cardFocusRing,
            )}
          >
            {label}
            {/* INSIDE the pill, not absolutely positioned over its corner.
                The strip above is `overflow-x-auto`, and an element hanging
                outside a scrolling child is clipped by the container's own
                overflow — the dot on the last tab would be cut in half at
                every width where the strip has to scroll, which is most of
                them on a phone. */}
            {dot && (
              <span className="ml-1.5 flex items-center">
                <UnseenDot label={student.tabs.unseenLabel} />
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
