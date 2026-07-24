import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard, getArchiveDates } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { ArchiveList } from "@/components/ArchiveList";

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date } = await searchParams;

  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) notFound();

  const selectedDate = parseDate(date);
  const [card, archiveDates] = await Promise.all([
    getEffectiveCard(group.id, selectedDate),
    getArchiveDates(group.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <h1 className="mb-8 text-center font-[var(--font-body)] text-lg text-[var(--color-ink-muted)]">
        {group.name}
      </h1>

      {card ? (
        <Flashcard card={card} />
      ) : (
        <p className="text-center font-[var(--font-body)] text-[var(--color-ink-muted)]">
          Nothing posted yet — check back soon!
        </p>
      )}

      <ArchiveList
        slug={slug}
        dates={archiveDates.map((d) => d.toISOString().slice(0, 10))}
        today={today}
        selected={date ?? today}
      />
    </main>
  );
}
