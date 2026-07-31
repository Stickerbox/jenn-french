import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
  deleteGroup,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { GroupList } from "@/components/admin/GroupList";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";
import { parseAdminTab } from "@/lib/admin-tab";
import { createPage } from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PageList } from "@/components/admin/PageList";
import { PageEditor } from "@/components/admin/PageEditor";
import { Collapsible } from "@/components/admin/Collapsible";

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

        {active === "daily" && <DailyWordTab selected={selected} today={today} />}
        {active === "groups" && <GroupsTab />}
        {active === "pages" && <PagesTab />}
      </div>
    </main>
  );
}

// Each tab runs only its own queries. The daily word no longer pays for the
// page list, and the page list no longer pays for a card it does not show.
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

async function GroupsTab() {
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { cards: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          cardCount: g._count.cards,
        }))}
        onDelete={deleteGroup}
      />

      <h2 className="mb-4 text-center font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
        Add a group
      </h2>
      <NewGroupForm onSubmit={createGroup} />
    </div>
  );
}

async function PagesTab() {
  // The group list is still needed here: the editor below assigns pages to
  // groups.
  const [pages, groups] = await Promise.all([
    listPagesForAdmin(),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <PageList pages={pages} />

      {/* Closed on arrival: the list is what she comes to this tab for, and
          the publish form is a whole screen of controls below it. */}
      <Collapsible label="Add a page">
        <PageEditor
          groups={groups}
          submitLabel="Publish page"
          onSubmit={createPage}
        />
      </Collapsible>
    </div>
  );
}
