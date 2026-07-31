import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { weekRange, formatWeekRange, latestViewableDate } from "@/lib/week";
import { parseStudentTab } from "@/lib/student-tab";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { listPagesForGroup } from "@/lib/pages";
import { StudentTabs } from "@/components/student/StudentTabs";
import { FilesTab } from "@/components/student/FilesTab";
import { ChatFab } from "@/components/chat/ChatFab";
import { StreamProvider } from "@/components/StreamProvider";
import { getCurrentTeacher } from "@/lib/session";
import { listWhiteboards } from "@/lib/whiteboards";
import { boardLabels } from "@/lib/whiteboard-names";
import { BoardTab } from "@/components/whiteboard/BoardTab";
import { markChatRead, deleteMessage, deleteWhiteboard } from "@/app/actions";

function parseDate(value: string | undefined, latest: Date): Date {
  if (!value) return latest;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return latest;
  // Clamp future-dated requests so students can never peek at words the
  // teacher has pre-posted ahead of time (a supported workflow). `latest` is
  // today, except at the weekend when it is the Friday that closed the week.
  return parsed.getTime() > latest.getTime() ? latest : parsed;
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const { date, tab: tab_ } = await searchParams;

  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) notFound();

  // The card is public; everything else needs the token. An untokened visitor
  // sees exactly what this page rendered before chat existed.
  const presented = readToken(
    undefined,
    (await cookies()).get(cookieNameFor(slug))?.value,
  );
  const unlocked =
    !group.isEveryone &&
    group.chatToken !== null &&
    presented === group.chatToken;

  // Jenn opens a student's page from the admin. chatRole already treats her
  // session as the teacher regardless of the token, so the only thing left is
  // giving her the two controls that used to live on /admin/[slug].
  const teacher = await getCurrentTeacher();
  const viewerIsTeacher = Boolean(teacher);

  // The everyone group has no chat but does show its own files, so its shelf
  // is public — that is the "someday" case the spec left room for.
  const pages =
    unlocked || group.isEveryone ? await listPagesForGroup(group.id) : [];

  // The board tab needs no "does one exist" check: it is present for anyone who
  // is unlocked, and shows an empty state otherwise. Jenn needs it to create
  // the first board, and the student needs it to watch the first being drawn.
  const boards = unlocked ? await listWhiteboards(group.id) : [];
  const labels = boardLabels(boards);

  const tab = parseStudentTab(tab_, {
    files: pages.length > 0,
    board: unlocked,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const selectedDate = parseDate(date, latestViewableDate(today));
  const card = await getEffectiveCard(selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  const { start: weekStart, end: weekEnd } = weekRange(today);

  // Extracted so the same tab body can render inside StreamProvider when the
  // visitor is unlocked and bare when they are not. Anything in here that calls
  // useStream — the live banner — has to be guarded on `unlocked` for that
  // reason: outside the provider the hook throws.
  const body = (
    <>
      {tab === "card" ? (
        <>
          <WeekDayPicker slug={slug} today={today} selected={selected} />
          {card ? (
            <Flashcard card={card} />
          ) : (
            <p className="text-center font-[family-name:var(--font-body)] text-[var(--color-ink-muted)]">
              Nothing posted yet — check back soon!
            </p>
          )}
        </>
      ) : tab === "files" ? (
        <FilesTab pages={pages} />
      ) : (
        <BoardTab
          slug={slug}
          isTeacher={viewerIsTeacher}
          boards={boards.map((board) => ({
            id: board.id,
            label: labels.get(board.id) ?? "",
            thumbnail: board.thumbnail,
            pageCount: board.pageCount,
          }))}
          onDelete={
            viewerIsTeacher ? deleteWhiteboard.bind(null, group.id) : undefined
          }
        />
      )}
    </>
  );

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

      {(pages.length > 0 || unlocked) && (
        <StudentTabs
          slug={slug}
          active={tab}
          date={selected}
          has={{ files: pages.length > 0, board: unlocked }}
        />
      )}

      {unlocked ? (
        <StreamProvider slug={slug}>
          {body}
          <ChatFab
            slug={slug}
            token={null}
            self={viewerIsTeacher ? "teacher" : "student"}
            onOpen={
              viewerIsTeacher ? markChatRead.bind(null, group.id) : undefined
            }
            onDeleteMessage={viewerIsTeacher ? deleteMessage : undefined}
            labels={{
              title: "Clavardage",
              empty: "Aucun message pour l'instant.",
              placeholder: "Écrivez un message…",
              send: "Envoyer",
              close: "Fermer",
              locale: "fr-CA",
              deleteMessage: "Supprimer",
            }}
          />
        </StreamProvider>
      ) : (
        body
      )}
    </main>
  );
}
