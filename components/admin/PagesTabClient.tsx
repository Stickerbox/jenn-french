"use client";

import { useState } from "react";
import { Collapsible } from "@/components/admin/Collapsible";
import { PageList, type PageSummary } from "@/components/admin/PageList";
import { PageEditor } from "@/components/admin/PageEditor";
import { AddLinkForm } from "@/components/admin/AddLinkForm";
import { defaultGroupId } from "@/lib/default-audience";
import type { LinkInput, PageInput } from "@/app/page-actions";

type AdminPage = Omit<PageSummary, "pinnedAt"> & {
  pins: { groupId: string; pinnedAt: Date }[];
};

// Owns the student chip, because three things now depend on it: which pages the
// list shows, which shelf a pin lands on, and which student a new page or link
// defaults to. It used to live inside PageList, which only needed the first.
export function PagesTabClient({
  pages,
  groups,
  everyoneName,
  today,
  onCreatePage,
  onCreateLink,
  onTogglePin,
}: {
  pages: AdminPage[];
  groups: { id: string; name: string }[];
  everyoneName: string | null;
  today: Date;
  onCreatePage: (input: PageInput) => Promise<unknown>;
  onCreateLink: (input: LinkInput) => Promise<unknown>;
  // Curried on groupId, so the client picks the shelf and the server still
  // re-authorises it.
  onTogglePin: (groupId: string, slug: string, pinned: boolean) => Promise<void>;
}) {
  const [group, setGroup] = useState<string | null>(null);
  const activeGroupId = defaultGroupId(group, groups);

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
        group={group}
        onGroup={setGroup}
        canPin={activeGroupId !== null}
        onTogglePin={
          activeGroupId ? onTogglePin.bind(null, activeGroupId) : async () => {}
        }
        today={today}
      />

      <div className="mx-auto w-full max-w-[560px]">
        <AddLinkForm
          groups={groups}
          defaultGroupId={activeGroupId}
          onSubmit={onCreateLink}
        />

        {/* Closed on arrival: the list is what she comes to this tab for, and
            the publish form is a whole screen of controls below it. */}
        <Collapsible label="Add a page">
          <PageEditor
            groups={groups}
            defaultGroupId={activeGroupId}
            submitLabel="Publish page"
            onSubmit={onCreatePage}
          />
        </Collapsible>
      </div>
    </div>
  );
}
