"use client";

import { PageList, type PageSummary } from "@/components/admin/PageList";
import { PageEditOverlay } from "@/components/admin/PageEditOverlay";
import { useAdminChip } from "@/components/admin/AdminChrome";
import { defaultGroupId } from "@/lib/default-audience";
import type { Locale } from "@/lib/i18n";

type AdminPage = Omit<PageSummary, "pinnedAt"> & {
  pins: { groupId: string; pinnedAt: Date }[];
};

// The student chip lives in AdminChrome now: the FAB outside these tab bodies
// needs the same value to default a new page's audience, and two copies of it
// would disagree the moment one was changed. This still owns what the chip
// MEANS for the list — which pages show and which shelf a pin lands on.
export function PagesTabClient({
  pages,
  groups,
  everyoneName,
  today,
  onTogglePin,
  onDelete,
  edit,
  locale,
}: {
  pages: AdminPage[];
  groups: { id: string; name: string; slug: string; isEveryone: boolean }[];
  everyoneName: string | null;
  today: Date;
  // Curried on groupId, so the client picks the shelf and the server still
  // re-authorises it.
  onTogglePin: (groupId: string, slug: string, pinned: boolean) => Promise<void>;
  // Not curried on a group: deleting a page removes it from every shelf it is
  // on, which is why it is teacher-only and why the student page's
  // deleteShelfLink is a different action.
  onDelete: (slug: string) => Promise<void>;
  // The slug whose editor is open, from ?edit= on the server.
  edit: string | null;
  // This is a client component reached directly from app/admin/page.tsx, so
  // it takes `locale` rather than the resolved `strings` object — a `Strings`
  // value holds functions and cannot cross that boundary. See lib/strings.ts.
  locale: Locale;
}) {
  const { chip, setChip } = useAdminChip();
  const activeGroupId = defaultGroupId(chip, groups);
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  // Defensive since 2026-08-07: `chip` is set only by PageList's chip row, and
  // visibleGroupChips no longer offers the everyone name, so this cannot be the
  // everyone group in practice. The clause stays because the rule behind it is
  // still true — that shelf is public and has no student for a version to
  // belong to, so a worksheet tile under it must fall back to the public page
  // rather than link at a route chatRole refuses. The same reasoning keeps
  // GroupList's canDeleteGroup fallback.
  const activeGroupSlug =
    activeGroup && !activeGroup.isEveryone ? activeGroup.slug : null;

  // Which pin applies depends on the chip. With "All" selected nothing is
  // pinned, because "All" is not a shelf — so the Pinned section does not
  // appear at all, which is correct rather than a missing feature.
  const withPins: PageSummary[] = pages.map(({ pins, ...page }) => ({
    ...page,
    pinnedAt: activeGroupId
      ? (pins.find((pin) => pin.groupId === activeGroupId)?.pinnedAt ?? null)
      : null,
  }));

  return (
    <div className="w-full">
      <PageList
        pages={withPins}
        everyoneName={everyoneName}
        group={chip}
        groupSlug={activeGroupSlug}
        onGroup={setChip}
        canPin={activeGroupId !== null}
        onTogglePin={
          activeGroupId ? onTogglePin.bind(null, activeGroupId) : async () => {}
        }
        onDelete={onDelete}
        today={today}
        locale={locale}
      />

      {/* Closing navigates back to the same URL without ?edit=, which keeps the
          chip and the search text — they live in this component's state, and it
          stays mounted because the overlay is a sibling rather than a route. */}
      <PageEditOverlay slug={edit} closeTo="?tab=pages" locale={locale} />
    </div>
  );
}
