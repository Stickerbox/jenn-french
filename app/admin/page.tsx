import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
  deleteGroup,
  regenerateStudentLinks,
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
import { unreadCounts } from "@/lib/messages";
import {
  createPage,
  createPdfPage,
  createLink,
  setShelfPin,
} from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PagesTabClient } from "@/components/admin/PagesTabClient";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { date, tab } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const active = parseAdminTab(tab);

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
          {active === "pages" && <PagesTab groups={groups} />}
        </AdminChrome>
      </div>
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
  const [groups, unread] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    unreadCounts(),
  ]);

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
        }))}
        onDelete={deleteGroup}
        onRegenerate={regenerateStudentLinks}
      />
    </div>
  );
}

// The group list arrives as a prop now: the page above already read it for the
// FAB, and a second identical query on this tab would be pure duplication.
async function PagesTab({
  groups,
}: {
  groups: { id: string; name: string; isEveryone: boolean }[];
}) {
  const pages = await listPagesForAdmin();

  // null when no row is flagged — a state the migration makes impossible, but
  // one the filter should degrade quietly on rather than crash.
  const everyoneName = groups.find((g) => g.isEveryone)?.name ?? null;

  // No 560px cap out here, unlike the other tabs: the page grid uses the
  // whole 1152px so four tiles are worth looking at. PagesTabClient caps its
  // own controls.
  return (
    <PagesTabClient
      pages={pages}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      everyoneName={everyoneName}
      today={new Date()}
      onTogglePin={setShelfPin}
    />
  );
}
