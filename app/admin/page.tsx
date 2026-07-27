import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
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

  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: selectedDate },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Daily word
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="font-[var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
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

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Groups
        </h2>
        <ul className="mb-6 flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/admin/${group.slug}`}
                className="text-[var(--color-accent)] underline"
              >
                {group.name} (/g/{group.slug})
              </Link>
            </li>
          ))}
          {groups.length === 0 && (
            <li className="text-sm text-[var(--color-ink-muted)]">
              No groups yet.
            </li>
          )}
        </ul>
        <NewGroupForm onSubmit={createGroup} />
      </div>
    </main>
  );
}
