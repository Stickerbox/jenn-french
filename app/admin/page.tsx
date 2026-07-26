import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertGlobalCard, createGroup } from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { NewGroupForm } from "@/components/admin/NewGroupForm";

export default async function AdminPage() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Today&apos;s word
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
        <CardEditor initialDate={today} onSubmit={upsertGlobalCard} />

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
