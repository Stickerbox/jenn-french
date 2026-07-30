import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminTab } from "@/lib/admin-tab";

// Only the daily word has a date. Carrying ?date= on its link is what makes
// leaving the tab and coming back land on the day she was working on.
const TABS: { tab: AdminTab; label: string; href: (date: string) => string }[] = [
  { tab: "daily", label: "Daily word", href: (date) => `/admin?date=${date}` },
  { tab: "groups", label: "Groups", href: () => "/admin?tab=groups" },
  { tab: "pages", label: "Pages", href: () => "/admin?tab=pages" },
];

export function AdminTabs({ active, date }: { active: AdminTab; date: string }) {
  return (
    // A nav of links, not an ARIA tablist: these are navigations to distinct
    // URLs, not panels swapped in place, and role="tab" would promise
    // arrow-key behaviour that browser navigation does not provide.
    <nav aria-label="Admin sections" className="mb-10 flex justify-center">
      <div className="flex gap-1 rounded-full border border-[var(--color-field-border)] bg-[var(--color-field)] p-1">
        {TABS.map(({ tab, label, href }) => (
          <Link
            key={tab}
            href={href(date)}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "rounded-full px-5 py-2 font-[family-name:var(--font-body)] text-sm transition-colors",
              tab === active
                ? "bg-[var(--color-accent)] font-medium text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
