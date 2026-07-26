import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { WeekDayPicker } from "@/components/WeekDayPicker";

function parseDate(value: string | undefined, today: Date): Date {
  if (!value) return today;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return today;
  // Clamp future-dated requests to today so students can never peek at
  // words the teacher has pre-posted ahead of time (a supported workflow).
  return parsed.getTime() > today.getTime() ? today : parsed;
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const selectedDate = parseDate(date, today);
  const card = await getEffectiveCard(group.id, selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <header className="mx-auto mb-7 max-w-[560px] text-center">
        <div className="mb-2.5 font-[var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          ⚜ La carte du jour ⚜
        </div>
        <div className="font-[var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
          Un jour, une carte — Québec-flavoured
        </div>
      </header>

      <WeekDayPicker slug={slug} today={today} selected={selected} />

      {card ? (
        <Flashcard card={card} />
      ) : (
        <p className="text-center font-[var(--font-body)] text-[var(--color-ink-muted)]">
          Nothing posted yet — check back soon!
        </p>
      )}
    </main>
  );
}
