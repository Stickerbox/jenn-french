import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { weekRange, formatWeekRange, latestViewableDate } from "@/lib/week";

function parseDate(value: string | undefined, latest: Date): Date {
  if (!value) return latest;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return latest;
  // Clamp future-dated requests so students can never peek at words the
  // teacher has pre-posted ahead of time (a supported workflow). `latest` is
  // today, except on Sunday when it is the Saturday that closed the week.
  return parsed.getTime() > latest.getTime() ? latest : parsed;
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
  const selectedDate = parseDate(date, latestViewableDate(today));
  const card = await getEffectiveCard(group.id, selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  const { start: weekStart, end: weekEnd } = weekRange(today);

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <header className="mx-auto mb-7 max-w-[560px] text-center">
        <div className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          ⚜ La carte du jour ⚜
        </div>
        <h1
          className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(30px, 5.5vw, 42px)", lineHeight: 1.15 }}
        >
          <Link href="/" className="transition-opacity hover:opacity-75">
            Français Avec Jenn
          </Link>
        </h1>
        <div className="font-[family-name:var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
          Un jour, une carte — Québec-flavoured
        </div>
        <div className="mt-2.5 font-[family-name:var(--card-font-mono)] text-[12px] uppercase tracking-[2px] text-[#8a7f6c]">
          {formatWeekRange(weekStart, weekEnd)}
        </div>
      </header>

      <WeekDayPicker slug={slug} today={today} selected={selected} />

      {card ? (
        <Flashcard card={card} />
      ) : (
        <p className="text-center font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]">
          Nothing posted yet — check back soon!
        </p>
      )}
    </main>
  );
}
