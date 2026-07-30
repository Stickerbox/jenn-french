import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminTab } from "@/lib/admin-tab";

const TABS: { tab: AdminTab; label: string }[] = [
  { tab: "daily", label: "Daily word" },
  { tab: "groups", label: "Groups" },
  { tab: "pages", label: "Pages" },
];

// Every link carries the date, not only the daily word's: a link that drops
// the param sends parseAdminDate back to today, so one detour through Groups
// would silently move her off the day she was working on.
function tabHref(tab: AdminTab, date: string): string {
  return tab === "daily"
    ? `/admin?date=${date}`
    : `/admin?tab=${tab}&date=${date}`;
}

export function AdminTabs({ active, date }: { active: AdminTab; date: string }) {
  return (
    // A nav of links, not an ARIA tablist: these are navigations to distinct
    // URLs, not panels swapped in place, and role="tab" would promise
    // arrow-key behaviour that browser navigation does not provide.
    <nav aria-label="Admin sections" className="mb-10 flex justify-center">
      <div className="flex gap-1 rounded-full border border-[var(--color-field-border)] bg-[var(--color-field)] p-1">
        {TABS.map(({ tab, label }) => (
          <Link
            key={tab}
            href={tabHref(tab, date)}
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
