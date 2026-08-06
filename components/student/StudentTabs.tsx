import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentTab } from "@/lib/student-tab";
import { currentStrings } from "@/lib/locale";

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
}: {
  slug: string;
  active: StudentTab;
  date: string;
  has: { card: boolean; files: boolean; board: boolean };
}) {
  const { student } = await currentStrings();

  const tabs: { tab: StudentTab; label: string; href: string }[] = [
    ...(has.card
      ? [{ tab: "card" as const, label: student.tabs.card, href: `/g/${slug}?date=${date}` }]
      : []),
    ...(has.files
      ? [{ tab: "files" as const, label: student.tabs.files, href: `/g/${slug}?tab=files` }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: student.tabs.board, href: `/g/${slug}?tab=board` }]
      : []),
  ];

  return (
    <nav
      aria-label={student.tabs.sectionsLabel}
      className="mx-auto mb-8 flex max-w-[560px] justify-center"
    >
      <div className="flex gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
        {tabs.map(({ tab, label, href }) => (
          <Link
            key={tab}
            href={href}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm transition-colors",
              tab === active
                ? "bg-[var(--card-bleu)] text-white"
                : "text-[var(--card-moss)]",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
