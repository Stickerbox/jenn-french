import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentTab } from "@/lib/student-tab";

// Mirrors /admin's strip so both halves of the site work the same way, in the
// flashcard palette rather than the admin one.
export function StudentTabs({
  slug,
  active,
  date,
  has,
}: {
  slug: string;
  active: StudentTab;
  date: string;
  has: { files: boolean; board: boolean };
}) {
  const tabs: { tab: StudentTab; label: string; href: string }[] = [
    { tab: "card", label: "La carte", href: `/g/${slug}?date=${date}` },
    ...(has.files
      ? [{ tab: "files" as const, label: "Les fichiers", href: `/g/${slug}?tab=files` }]
      : []),
    ...(has.board
      ? [{ tab: "board" as const, label: "Le tableau", href: `/g/${slug}?tab=board` }]
      : []),
  ];

  return (
    <nav
      aria-label="Sections"
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
