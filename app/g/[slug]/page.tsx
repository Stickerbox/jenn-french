import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { weekRange, latestViewableDate } from "@/lib/week";
import { parseStudentTab } from "@/lib/student-tab";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { listPagesForGroup } from "@/lib/pages";
import { StudentTabs } from "@/components/student/StudentTabs";
import { FilesTab } from "@/components/student/FilesTab";
import { ShelfFab } from "@/components/student/ShelfFab";
import { greeting, teacherPageLabel } from "@/lib/student-greeting";
import { CardHeading } from "@/components/student/CardHeading";
import { ChatFab } from "@/components/chat/ChatFab";
import { StreamProvider } from "@/components/StreamProvider";
import { streamUrl } from "@/lib/stream-url";
import { getCurrentTeacher } from "@/lib/session";
import { authPanelMode, studentGate } from "@/lib/student-gate";
import { StudentAuthPanel } from "@/components/student/StudentAuthPanel";
import { listWhiteboards } from "@/lib/whiteboards";
import { boardLabels } from "@/lib/whiteboard-names";
import { BoardTab } from "@/components/whiteboard/BoardTab";
import { LiveBanner } from "@/components/whiteboard/LiveBanner";
// markChatRead and deleteMessage left with TeacherInbox: both are controls over
// her own conversation, and this page no longer decides who gets them.
import { deleteWhiteboard } from "@/app/actions";
import { TeacherInbox } from "@/components/chat/TeacherInbox";
import {
  addShelfLink,
  addShelfPage,
  setShelfPin,
  deleteShelfLink,
} from "@/app/page-actions";

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

  // An explicit select rather than the whole row, because one of these columns
  // is a password hash and this file renders into a client tree. It is read for
  // exactly one boolean, below, and never referenced again.
  const group = await prisma.group.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      isEveryone: true,
      chatToken: true,
      passwordHash: true,
    },
  });
  if (!group) notFound();

  // The card is public; everything else needs the token AND an account. An
  // untokened visitor sees exactly what this page rendered before chat existed.
  const presented = readToken(
    undefined,
    (await cookies()).get(cookieNameFor(slug))?.value,
  );

  // Jenn opens a student's page from the admin. chatRole already treats her
  // session as the teacher regardless of the token, so the only thing left is
  // giving her the two controls that used to live on /admin/[slug].
  const teacher = await getCurrentTeacher();
  const viewerIsTeacher = Boolean(teacher);

  // One rule, in one place, with a test that enumerates every state — see
  // lib/student-gate.ts. `unlocked` is derived from it rather than computed
  // beside it, so the panel and the tabs cannot disagree about who is signed in.
  const gate = studentGate({
    isTeacher: viewerIsTeacher,
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented,
    claimed: group.passwordHash !== null,
  });
  const unlocked = gate === "signed-in";

  // Null for the teacher in every state — see authPanelMode. `unlocked` above
  // is untouched by this and still gates the tabs from the token alone.
  const panelMode = authPanelMode(gate, viewerIsTeacher);

  // The everyone group has no chat but does show its own files, so its shelf
  // is public — that is the "someday" case the spec left room for.
  const pages =
    unlocked || group.isEveryone ? await listPagesForGroup(group.id) : [];

  // The board tab needs no "does one exist" check: it is present for anyone who
  // is unlocked, and shows an empty state otherwise. Jenn needs it to create
  // the first board, and the student needs it to watch the first being drawn.
  const boards = unlocked ? await listWhiteboards(group.id) : [];
  const labels = boardLabels(boards);

  // Both extra tabs are present for anyone unlocked, empty state and all. A
  // student with an empty shelf otherwise has no way to reach the control that
  // fills it, because the tab holding it is hidden for being empty. The second
  // clause exists only for the everyone group, whose shelf is public and has no
  // unlocked state to key off.
  // Jenn opening a student from the Students tab arrives with ?k=, so she is
  // unlocked; the card she would see here is the same global card she just
  // finished editing in /admin. Withheld only when she IS unlocked: a teacher
  // who types /g/marie with no token is, to this page, a visitor with the
  // public card, and hiding it there would serve her a page with nothing on it.
  const showCard = !(viewerIsTeacher && unlocked);

  const tab = parseStudentTab(tab_, {
    card: showCard,
    files: unlocked || pages.length > 0,
    board: unlocked,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const selectedDate = parseDate(date, latestViewableDate(today));
  const card = await getEffectiveCard(selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  const { start: weekStart, end: weekEnd } = weekRange(today);

  // Her line, not theirs. English for Jenn and French for the student, following
  // the split this codebase keeps everywhere else — and still nothing at all on
  // the everyone group, which is named "Everyone" and is nobody's page.
  const headerLine = group.isEveryone
    ? null
    : viewerIsTeacher
      ? teacherPageLabel(group.name)
      : greeting(group.name);

  // Extracted so the same tab body can render inside StreamProvider when the
  // visitor is unlocked and bare when they are not. Anything in here that calls
  // useStream — the live banner — has to be guarded on `unlocked` for that
  // reason: outside the provider the hook throws.
  const body = (
    <>
      {/* Guarded on `unlocked` as well as the tab: LiveBanner calls useStream,
          and `body` also renders outside the provider for a visitor who only
          has the public card. The board tab shows the thing itself.

          Also !viewerIsTeacher: she is the only person who can be drawing —
          exactly one teacher, exactly one passkey — so a banner announcing
          "Jenn dessine en ce moment" on her own other tab is telling her about
          herself, with a button offering to take her to the board she is already
          on. The clause lives here rather than inside LiveBanner because this
          page already owns the composition and the banner has no business
          learning who the teacher is. BoardTab's live view is already
          !isTeacher; only the banner was missed. */}
      {unlocked && !viewerIsTeacher && tab !== "board" && (
        <LiveBanner slug={slug} />
      )}

      {tab === "card" ? (
        <>
          <CardHeading weekStart={weekStart} weekEnd={weekEnd} />
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
        <FilesTab
          pages={pages}
          today={today}
          canWrite={unlocked}
          onTogglePin={setShelfPin.bind(null, group.id)}
          onDeleteLink={deleteShelfLink.bind(null, group.id)}
        />
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
      className="relative min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      {/* Absolutely positioned inside main's existing py-12, so the centred
          header does not shift by a pixel at any width. ?tab=groups and not the
          default: the Students tab is where she came from, and returning her
          somewhere else is a small lie the button would tell every time.

          It needs no guard wiring of its own — BoardEditor's capture-phase
          listener sees it because it is an anchor, which is the property that
          decision was made for. */}
      {viewerIsTeacher && (
        <Link
          href="/admin?tab=groups"
          className="absolute left-4 top-4 z-10 rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-opacity hover:opacity-80"
        >
          ← Back to admin
        </Link>
      )}

      <header className="mx-auto mb-7 max-w-[560px] text-center">
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
        {/* Suppressed on the everyone group, whose name is literally "Everyone".
            The greeting is shown to untokened visitors too: /g/marie already
            spells the name in the URL, so there is nothing here a token was
            protecting. */}
        {headerLine && (
          <div className="mt-3 font-[family-name:var(--card-font-serif)] text-[19px] text-[var(--card-moss)]">
            {headerLine}
          </div>
        )}
      </header>

      {(pages.length > 0 || unlocked) && (
        <StudentTabs
          slug={slug}
          active={tab}
          date={selected}
          has={{
            card: showCard,
            files: unlocked || pages.length > 0,
            board: unlocked,
          }}
        />
      )}

      {panelMode && <StudentAuthPanel slug={slug} mode={panelMode} />}

      {/* Teacher-facing, and therefore English and static — no client component
          needed. Rendered here rather than inside StudentAuthPanel because both
          notices name the STUDENT, and the student's name is deliberately
          absent from the public page. Keeping it on a teacher-only branch is
          what stops a public visitor's HTML from ever containing it. */}
      {gate === "unclaimed" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          <p className="mb-2">
            {group.name} hasn&apos;t signed up yet. Share this link once — it
            lets them create their account:
          </p>
          <code className="break-all text-xs">
            /g/{slug}?k={group.chatToken}
          </code>
        </div>
      )}

      {gate === "teacher-stale" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          Your link for {group.name} is out of date — {group.name} has signed up
          since, which changes it. Open this student from the admin Students tab
          to unlock the chat and boards.
        </div>
      )}

      {viewerIsTeacher ? (
        // Her inbox owns the provider here, so `body` sits inside it and the
        // board tab still has a stream to read. Two providers would mean two
        // EventSources.
        //
        // She gets no ChatFab: the inbox replaces it, and it reaches her on
        // this page through her session rather than through this student's
        // token. `unlocked` is untouched and still gates everything in `body` —
        // a teacher without the token sees the same page body a stranger does.
        //
        // Deliberately independent of the gate. In "unclaimed" she gets the
        // conversation with the composer replaced by the invite; in
        // "teacher-stale" — her cookie left behind by the token rotation a
        // claim performs — she keeps the conversation and loses only the tabs,
        // which is strictly better than losing both.
        <TeacherInbox studentSlug={slug}>
          {body}
          {/* Still on `unlocked`, not on her session: the shelf controls belong
              to the page body, which the token gates. Only the chat moved. */}
          {unlocked && (
            <ShelfFab
              onAddLink={addShelfLink.bind(null, group.id)}
              onAddPage={addShelfPage.bind(null, group.id)}
            />
          )}
        </TeacherInbox>
      ) : unlocked ? (
        <StreamProvider url={streamUrl({ isTeacher: false, slug })}>
          {body}
          <ChatFab
            slug={slug}
            labels={{
              title: "Clavardage",
              empty: "Aucun message pour l'instant.",
              placeholder: "Écrivez un message…",
              send: "Envoyer",
              close: "Fermer",
              // Never shown — a student has no list to go back to — but the
              // panel's label type asks for it.
              back: "Retour",
              locale: "fr-CA",
              today: "Aujourd'hui",
              // Never shown either: onDeleteMessage is not passed here.
              deleteMessage: "Supprimer",
            }}
          />
          <ShelfFab
            onAddLink={addShelfLink.bind(null, group.id)}
            onAddPage={addShelfPage.bind(null, group.id)}
          />
        </StreamProvider>
      ) : (
        body
      )}
    </main>
  );
}
