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
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
        <div className="mx-auto mb-8 flex w-full max-w-[560px] items-center justify-between lg:mx-0">
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

        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <AdminDatePicker basePath="/admin" selected={selected} today={today} />
        </div>

        <CardEditor
          key={selected}
          initialDate={selected}
          initialValues={toCardFormValues(existingCard)}
          onSubmit={upsertGlobalCard}
          onDelete={deleteGlobalCard}
        />

        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
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
      </div>
    </main>
  );
}
