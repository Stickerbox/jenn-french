"use client";

import { PageList, type PageSummary } from "@/components/admin/PageList";
import { useAdminChip } from "@/components/admin/AdminChrome";
import { defaultGroupId } from "@/lib/default-audience";

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
}: {
  pages: AdminPage[];
  groups: { id: string; name: string }[];
  everyoneName: string | null;
  today: Date;
  // Curried on groupId, so the client picks the shelf and the server still
  // re-authorises it.
  onTogglePin: (groupId: string, slug: string, pinned: boolean) => Promise<void>;
}) {
  const { chip, setChip } = useAdminChip();
  const activeGroupId = defaultGroupId(chip, groups);

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
        onGroup={setChip}
        canPin={activeGroupId !== null}
        onTogglePin={
          activeGroupId ? onTogglePin.bind(null, activeGroupId) : async () => {}
        }
        today={today}
      />
    </div>
  );
}
