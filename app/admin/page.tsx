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
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { GroupList } from "@/components/admin/GroupList";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { date } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const selectedDate = new Date(`${selected}T00:00:00Z`);

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { cards: true } } },
  });
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: selectedDate },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Daily word
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="font-[family-name:var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
            >
              Log out
            </button>
          </form>
        </div>

        <AdminDatePicker basePath="/admin" selected={selected} />

        <CardEditor
          key={selected}
          initialDate={selected}
          initialValues={toCardFormValues(existingCard)}
          onSubmit={upsertGlobalCard}
          onDelete={deleteGlobalCard}
        />

        <h2 className="mb-4 mt-12 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Groups
        </h2>
        <GroupList
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            slug: g.slug,
            cardCount: g._count.cards,
          }))}
          onDelete={deleteGroup}
        />

        <NewGroupForm onSubmit={createGroup} />
      </div>
    </main>
  );
}
