import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminTab } from "@/lib/admin-tab";
import type { Strings } from "@/lib/strings";
import { cardFocusRing } from "@/components/card-styles";

// Every link carries the date, not only the daily word's: a link that drops
// the param sends parseAdminDate back to today, so one detour through Students
// would silently move her off the day she was working on.
function tabHref(tab: AdminTab, date: string): string {
  return tab === "daily"
    ? `/admin?date=${date}`
    : `/admin?tab=${tab}&date=${date}`;
}

export function AdminTabs({
  active,
  date,
  strings,
}: {
  active: AdminTab;
  date: string;
  strings: Strings;
}) {
  const TABS: { tab: AdminTab; label: string }[] = [
    { tab: "daily", label: strings.admin.nav.daily },
    { tab: "groups", label: strings.admin.nav.students },
    { tab: "pages", label: strings.admin.nav.pages },
  ];

  return (
    // A nav of links, not an ARIA tablist: these are navigations to distinct
    // URLs, not panels swapped in place, and role="tab" would promise
    // arrow-key behaviour that browser navigation does not provide.
    <nav
      aria-label={strings.admin.nav.sectionsLabel}
      // mb-[var(--space-5)]: the same 32px named unit the header above it uses
      // (app/admin/page.tsx) — this used to be mb-10 (40px), a number close
      // enough to the student page's matching tab strip (mb-8, 32px) to look
      // like a typo rather than a choice. Task I mirrored the two pages'
      // header rhythm; this closes the one gap that mirroring missed.
      className="mb-[var(--space-5)] flex justify-center"
    >
      {/* Container in the card palette's paper and line, matching the pill
          treatment CardDateNav gave the week-range trigger. The active tab
          keeps the lilac accent — a primary control, per Task I's rule — and
          only the surrounding chrome and the inactive state moved. */}
      <div className="flex gap-1 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] p-1">
        {TABS.map(({ tab, label }) => (
          <Link
            key={tab}
            href={tabHref(tab, date)}
            aria-current={tab === active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] items-center rounded-full px-5 py-2 font-[family-name:var(--font-body)] text-sm transition-colors duration-150 motion-reduce:transition-none",
              tab === active
                ? "bg-[var(--color-accent)] font-medium text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--card-ink)]",
              cardFocusRing,
            )}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
