import { redirect, notFound } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertOverrideCard } from "@/app/actions";
import { CardForm } from "@/components/admin/CardForm";

export default async function GroupAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const group = await prisma.group.findUnique({
    where: { slug },
    include: { cards: { orderBy: { date: "desc" } } },
  });
  if (!group) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-8 font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {group.name} overrides
        </h1>
        <CardForm
          initialDate={today}
          onSubmit={upsertOverrideCard.bind(null, group.id)}
        />

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Existing overrides
        </h2>
        <ul className="flex flex-col gap-1 font-[var(--font-body)] text-sm text-[var(--color-ink-muted)]">
          {group.cards.map((card) => (
            <li key={card.id}>
              {card.date.toISOString().slice(0, 10)} — {card.frenchAnswer}
            </li>
          ))}
          {group.cards.length === 0 && <li>No overrides yet.</li>}
        </ul>
      </div>
    </main>
  );
}
