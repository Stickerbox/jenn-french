import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
  deleteGroup,
  resetStudentSignIn,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminChrome } from "@/components/admin/AdminChrome";
import { GroupList } from "@/components/admin/GroupList";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";
import { parseAdminTab } from "@/lib/admin-tab";
import { listConversations } from "@/lib/inbox";
import {
  createPage,
  createPdfPage,
  createLink,
  deletePage,
  setShelfPin,
} from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PagesTabClient } from "@/components/admin/PagesTabClient";
import { ThumbBackfill } from "@/components/admin/ThumbBackfill";
import { readPageKind } from "@/lib/page-kind";
import { pageVersion } from "@/lib/page-version";
import { TeacherInbox } from "@/components/chat/TeacherInbox";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string; edit?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { date, tab, edit } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  // ?edit= implies the Pages tab. A relative "?edit=..." href replaces the whole
  // query string rather than merging into it, so the pencil has to carry
  // ?tab=pages itself — and it does — but a hand-typed or bookmarked ?edit=
  // would otherwise land on the daily word with an overlay that never mounts,
  // which reads as the link being broken. The edit param is meaningless on the
  // other two tabs, so there is nothing to disambiguate.
  const active = parseAdminTab(tab ?? (edit ? "pages" : undefined));

  // Fetched here rather than inside PagesTab, which is where it used to live:
  // the FAB is outside the tab bodies and needs the audience list on every one
  // of them. This knowingly weakens "each tab runs only its own queries" below
  // — one indexed read of a table with a handful of rows is what the control
  // costs to be in a single place.
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, isEveryone: true },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
        <header className="relative mb-8 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Français avec Jenn
          </h1>
          {/* Absolute rather than a flex row, so the title centres on the
              page instead of on the space the Log out button leaves it. */}
          <form action={logout} className="absolute right-0 top-1">
            <button
              type="submit"
              className="font-[family-name:var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
            >
              Log out
            </button>
          </form>
        </header>

        <AdminTabs active={active} date={selected} />

        <AdminChrome
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onCreateStudent={createGroup}
          onCreateLink={createLink}
          onCreatePage={createPage}
          onCreatePdfPage={createPdfPage}
        >
          {active === "daily" && <DailyWordTab selected={selected} today={today} />}
          {active === "groups" && <GroupsTab />}
          {active === "pages" && <PagesTab groups={groups} edit={edit ?? null} />}
        </AdminChrome>
      </div>

      {/* Outside the width wrapper: the FAB is fixed-positioned and a
          max-width ancestor would have no effect, but nesting it inside a
          content column implies otherwise. */}
      <TeacherInbox />
    </main>
  );
}

async function DailyWordTab({
  selected,
  today,
}: {
  selected: string;
  today: string;
}) {
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: new Date(`${selected}T00:00:00Z`) },
  });

  return (
    <>
      {/* Handed to the editor rather than placed here: the compose step is one
          centred column and the editing step is a two-column grid, and only
          the editor knows which one is on screen. */}
      <CardEditor
        key={selected}
        initialDate={selected}
        initialValues={toCardFormValues(existingCard)}
        datePicker={
          <AdminDatePicker basePath="/admin" selected={selected} today={today} />
        }
        onSubmit={upsertGlobalCard}
        onDelete={deleteGlobalCard}
      />
    </>
  );
}

// Each tab runs its own queries, apart from the group list the FAB above needs
// on all three.
async function GroupsTab() {
  // The group query stays as it is — including its email/claimedAt selection —
  // because this list includes the everyone row, which has no conversation and
  // so is absent from listConversations.
  const [groups, conversations] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listConversations(),
  ]);
  const unread = new Map(conversations.map((c) => [c.groupId, c.unread]));

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          isEveryone: g.isEveryone,
          unread: unread.get(g.id) ?? 0,
          chatToken: g.chatToken,
          email: g.email,
          claimedAt: g.claimedAt,
        }))}
        onDelete={deleteGroup}
        onReset={resetStudentSignIn}
      />
    </div>
  );
}

// The group list arrives as a prop now: the page above already read it for the
// FAB, and a second identical query on this tab would be pure duplication.
async function PagesTab({
  groups,
  edit,
}: {
  groups: { id: string; name: string; isEveryone: boolean }[];
  // The slug whose editor is open, from ?edit=. Read here and handed down
  // rather than held in client state: see the pencil's comment in PageList.
  edit: string | null;
}) {
  const pages = await listPagesForAdmin();

  // null when no row is flagged — a state the migration makes impossible, but
  // one the filter should degrade quietly on rather than crash.
  const everyoneName = groups.find((g) => g.isEveryone)?.name ?? null;

  // Derived from the list already fetched above rather than queried again: the
  // two facts it needs — the kind and whether a preview exists — are both in
  // SHELF_SELECT, and `thumb` itself is deliberately not, which is the whole
  // reason thumbAt is a separate column.
  const missingThumbs = pages
    .filter((page) => readPageKind(page) === "html" && page.thumbAt === null)
    .map((page) => ({ slug: page.slug, version: pageVersion(page.updatedAt) }));

  // No 560px cap out here, unlike the other tabs: the page grid uses the
  // whole 1152px so four tiles are worth looking at. PagesTabClient caps its
  // own controls.
  return (
    <>
      {/* Teacher-only, which /admin already guarantees for everything it
          renders — this needs no guard of its own, and adding one would imply
          the rest of the tab has a weaker one. */}
      <ThumbBackfill pages={missingThumbs} />
      <PagesTabClient
        pages={pages}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        everyoneName={everyoneName}
        today={new Date()}
        onTogglePin={setShelfPin}
        onDelete={deletePage}
        edit={edit}
      />
    </>
  );
}
