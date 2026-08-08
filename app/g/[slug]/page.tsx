import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard, listCardDates } from "@/lib/cards";
import { pickRevisionDate } from "@/lib/card-revision";
import { Flashcard } from "@/components/Flashcard";
import { CardDateNav } from "@/components/student/CardDateNav";
import { latestViewableDate } from "@/lib/week";
import { parseStudentTab } from "@/lib/student-tab";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { listPagesForGroup } from "@/lib/pages";
import { StudentTabs } from "@/components/student/StudentTabs";
import { FilesTab } from "@/components/student/FilesTab";
import { PageEditOverlay } from "@/components/admin/PageEditOverlay";
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
import { listFlashcards } from "@/lib/flashcards";
import { listActionItems } from "@/lib/action-items";
import { DeckTab } from "@/components/student/DeckTab";
import { TodoTab } from "@/components/student/TodoTab";
import { MarkTabSeen } from "@/components/student/MarkTabSeen";
import { markTabSeen } from "@/app/seen-actions";
import { pageIsUnseen, countUnseen } from "@/lib/unseen";
import {
  addFlashcard,
  deleteFlashcard,
  markFlashcardViewed,
  addActionItem,
  setActionItemDone,
  deleteActionItem,
} from "@/app/deck-actions";
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
  addShelfPdf,
  setShelfPin,
  deleteShelfLink,
} from "@/app/page-actions";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";
import { toBCP47 } from "@/lib/i18n";
import { cardFocusRing, emptyStateText } from "@/components/card-styles";
import { cn } from "@/lib/utils";

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
  searchParams: Promise<{ date?: string; tab?: string; edit?: string }>;
}) {
  const { slug } = await params;
  const { date, tab: tab_, edit } = await searchParams;

  // Read once, at the top, and threaded through everything below. This is a
  // server component, so headers() is in scope, and every branch on this page
  // — the student's card and files, the teacher's notices, the chat labels —
  // needs the same dictionary.
  const locale = await currentLocale();
  const strings = getStrings(locale);

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
      teacherSeenFilesAt: true,
      teacherSeenDeckAt: true,
      teacherSeenTodoAt: true,
      studentSeenFilesAt: true,
      studentSeenDeckAt: true,
      studentSeenTodoAt: true,
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
  const labels = boardLabels(boards, locale);

  // Both follow the same rule the shelf and the board already do: fetched only
  // when the visitor is unlocked, because an untokened visitor has neither tab
  // and a query for a list they cannot see is a query for nothing.
  const flashcards = unlocked ? await listFlashcards(group.id) : [];
  const actionItems = unlocked ? await listActionItems(group.id) : [];

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
    // Both new tabs follow the same rule Files and Whiteboard already use:
    // present for anyone unlocked, empty state and all.
    deck: unlocked,
    todo: unlocked,
  });

  // Which watermark this reader reads. The everyone group has neither, which is
  // chatRole's own first clause reaching this page: its shelf is public and it
  // has no student for a visit to belong to.
  const seen = group.isEveryone
    ? { files: null, deck: null, todo: null }
    : viewerIsTeacher
      ? {
          files: group.teacherSeenFilesAt,
          deck: group.teacherSeenDeckAt,
          todo: group.teacherSeenTodoAt,
        }
      : {
          files: group.studentSeenFilesAt,
          deck: group.studentSeenDeckAt,
          todo: group.studentSeenTodoAt,
        };

  // The tab dot is the shelf's own predicate over the whole list, NOT a second
  // count. A Files tab lit above a shelf with no marked tile is the failure the
  // worksheet rules record about shelfSlotCount.
  const dots = unlocked
    ? {
        files: pages.some((page) =>
          pageIsUnseen(page, seen.files, viewerIsTeacher),
        ),
        deck:
          countUnseen(
            flashcards.map((card) => ({
              at: card.createdAt,
              fromTeacher: card.fromTeacher,
            })),
            seen.deck,
            viewerIsTeacher,
          ) > 0,
        // TWO events per row, not one, and this is the one place the tab dot
        // and the admin bullet deliberately disagree. The bullet counts what
        // the student FINISHED, which is what Jenn asked to be told. The dot
        // means "the other party touched your list", and on a checklist the
        // event that matters most to a student is Jenn ADDING something —
        // under a done-only rule that lit nothing at all, while their own tick
        // lit hers. The dot was reporting progress upward and new work not at
        // all.
        //
        // countUnseen still drops your own of either kind, so adding a row for
        // yourself does not light your own tab.
        todo:
          countUnseen(
            actionItems.flatMap((item) => [
              { at: item.createdAt, fromTeacher: item.fromTeacher },
              ...(item.doneAt
                ? [
                    {
                      at: item.doneAt,
                      fromTeacher: item.doneByTeacher ?? false,
                    },
                  ]
                : []),
            ]),
            seen.todo,
            viewerIsTeacher,
          ) > 0,
      }
    : { files: false, deck: false, todo: false };

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayStr}T00:00:00Z`);
  // One value doing two jobs, deliberately: the ceiling parseDate clamps to,
  // and the day Aujourd'hui goes to. Both are "the latest day a student may
  // look at", which on a weekend is the Friday that closed the week.
  const latest = latestViewableDate(today);
  const selectedDate = parseDate(date, latest);
  const card = await getEffectiveCard(selectedDate);

  const selected = selectedDate.toISOString().slice(0, 10);
  const latestStr = latest.toISOString().slice(0, 10);
  // Only for the card tab, and bounded, so the dates of pre-posted cards never
  // reach the browser. An unlocked teacher has no card tab, so her page does
  // not run this query at all.
  const cardDates = tab === "card" ? await listCardDates(latest) : [];

  // Nothing posted for the latest day a student may open? Show an old card for
  // revision rather than an empty page. See lib/card-revision.ts for the rule
  // and for why this is not the silent fallback that was removed on
  // 2026-07-31.
  //
  // `selected === latestStr` is the whole of "today only". A past date the
  // student navigated to keeps saying nothing was posted, which is what lets
  // the calendar go on disabling those days honestly — the exact disagreement
  // between the page and the picker that killed the old fallback.
  //
  // Resolved HERE, at read time, which is the other half of the ask and costs
  // nothing: the moment Jenn posts a card for this date, `card` is non-null
  // and none of this runs.
  const revisionDate =
    tab === "card" && !card && selected === latestStr
      ? pickRevisionDate(cardDates, selected)
      : null;
  const revisionCard = revisionDate
    ? await getEffectiveCard(new Date(`${revisionDate}T00:00:00Z`))
    : null;

  // Whoever is looking at the page, not "her line vs. theirs" — that used to
  // mean English for Jenn and French for the student because the whole app
  // split that way. It is retired: BOTH now read from `locale`, which is the
  // same value for either party on a given request, because it comes from
  // whoever's browser is asking. Still nothing at all on the everyone group,
  // which is named "Everyone" and is nobody's page.
  const headerLine = group.isEveryone
    ? null
    : viewerIsTeacher
      ? teacherPageLabel(group.name, locale)
      : greeting(group.name, locale);

  // Extracted so the same tab body can render inside StreamProvider when the
  // visitor is unlocked and bare when they are not. Anything in here that calls
  // useStream — the live banner — has to be guarded on `unlocked` for that
  // reason: outside the provider the hook throws.
  const body = (
    <>
      {/* Stamps the watermark for whichever tab is open. Only the three that
          have one, and never on the everyone group — markTabSeen refuses it
          anyway through chatRole, but there is no reason to post.

          THE COST, stated: an unlocked teacher has no card tab and lands on
          Files, so opening a student from the admin always stamps
          teacherSeenFilesAt. That is honest — she is looking at the shelf — but
          it makes "N new files" a weaker signal than the homework bullets,
          which have no watermark and do not clear on sight at all. */}
      {unlocked &&
        !group.isEveryone &&
        (tab === "files" || tab === "deck" || tab === "todo") && (
          // key={tab} IS THE WHOLE CONTROL, and without it two of the three
          // dots never clear at all. Moving between tabs is a search-param
          // navigation, so this element keeps its position and its type in the
          // tree; React reconciles it to the same instance, MarkTabSeen's
          // once-only ref is still set, and its effect returns without writing.
          // Jenn lands on Files, so Files spends the single stamp and the deck
          // and to-do watermarks are the ones that never move.
          <MarkTabSeen
            key={tab}
            onSeen={markTabSeen.bind(null, group.id, tab)}
          />
        )}

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
        <LiveBanner slug={slug} locale={locale} />
      )}

      {tab === "card" ? (
        <>
          <CardHeading />
          <CardDateNav
            slug={slug}
            selected={selected}
            today={todayStr}
            latest={latestStr}
            cardDates={cardDates}
            locale={locale}
          />
          {card ? (
            <Flashcard card={card} locale={locale} />
          ) : revisionCard ? (
            // Its own date, its own content, untouched — only the chip says
            // why it is here. The calendar above is deliberately NOT told
            // about it: today still has no card, and the day this card really
            // belongs to is still the day that opens it.
            <Flashcard card={revisionCard} locale={locale} revision />
          ) : (
            // emptyStateText: the same treatment the shelf's own empty and
            // no-match lines use — this is the card tab's version of "there is
            // nothing here", and before this it was drawn in the ADMIN's
            // --color-* palette on a page whose every other line is --card-*.
            <p className={emptyStateText}>
              {strings.student.page.nothingPosted}
            </p>
          )}
        </>
      ) : tab === "files" ? (
        <FilesTab
          pages={pages}
          today={today}
          canWrite={unlocked}
          canDeleteAny={viewerIsTeacher}
          canEdit={viewerIsTeacher}
          // Null on the everyone group: its shelf at /g/all is rendered
          // publicly and pageTarget has no isEveryone clause of its own — a
          // worksheet flagged for everyone would otherwise draw a visible
          // tile linking to /g/all/w/<slug>, which resolveWorksheet refuses
          // because chatRole refuses the everyone group before anything
          // else. This is where that gets closed: no shelf, no worksheet
          // route, so the tile falls back to the public page.
          groupSlug={group.isEveryone ? null : slug}
          seenAt={seen.files}
          viewerIsTeacher={viewerIsTeacher}
          onTogglePin={setShelfPin.bind(null, group.id)}
          onDeleteLink={deleteShelfLink.bind(null, group.id)}
          locale={locale}
        />
      ) : tab === "deck" ? (
        <DeckTab
          cards={flashcards}
          isTeacher={viewerIsTeacher}
          locale={locale}
          // The deck's own + button, not the page-level shelf FAB: a card is
          // not a document and does not belong in a menu whose other items all
          // land on the Files tab.
          onAdd={addFlashcard.bind(null, group.id)}
          onDelete={deleteFlashcard.bind(null, group.id)}
          // The bound ACTION, not an arrow — a closure cannot cross the
          // server/client boundary. DeckTab fires it without awaiting, from
          // the handler that turns a card to its answer.
          onViewed={markFlashcardViewed.bind(null, group.id)}
        />
      ) : tab === "todo" ? (
        <TodoTab
          items={actionItems}
          studentName={group.name}
          locale={locale}
          onAdd={addActionItem.bind(null, group.id)}
          onSetDone={setActionItemDone.bind(null, group.id)}
          onDelete={deleteActionItem.bind(null, group.id)}
        />
      ) : (
        <BoardTab
          slug={slug}
          isTeacher={viewerIsTeacher}
          locale={locale}
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
      {/* Teacher-only, and it grants no authority the pencil did not already
          imply: updatePage, updatePdfPage and deletePage are all
          requireTeacher(). Mounted here rather than inside FilesTab so it
          survives a tab change while open. */}
      {viewerIsTeacher && (
        <PageEditOverlay
          slug={edit ?? null}
          closeTo="?tab=files"
          locale={locale}
        />
      )}

      {viewerIsTeacher && (
        <Link
          href="/admin?tab=groups"
          className={cn(
            "absolute left-4 top-4 z-10 flex min-h-[44px] items-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none",
            cardFocusRing,
          )}
        >
          {strings.student.page.backToAdmin}
        </Link>
      )}

      {/* mb-[var(--space-5)]: same 32px as the tab strip below it
          (StudentTabs) and the date nav below that (CardDateNav) — three
          zone-transitions on this page sharing one named gap instead of
          mb-7/mb-8/mb-8, three numbers close enough to read as a mistake. */}
      <header className="mx-auto mb-[var(--space-5)] max-w-[560px] text-center">
        {/* Not a link to "/" — the landing page redirects a signed-in student
            straight back here, so pressing the site's own name used to be a
            round trip to nowhere. */}
        <h1
          className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(30px, 5.5vw, 42px)", lineHeight: 1.15 }}
        >
          {strings.student.brand.wordmark}
        </h1>
        {/* The card tab only. The line describes the daily card — "one day,
            one card" — and it sat above the Files and Whiteboard tabs too,
            where it described nothing on the screen. An unlocked teacher has
            no card tab at all, so it never shows for her, which is right for
            the same reason. */}
        {tab === "card" && (
          <div className="font-[family-name:var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
            {strings.student.brand.tagline}
          </div>
        )}
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
            deck: unlocked,
            todo: unlocked,
          }}
          dots={dots}
        />
      )}

      {/* signup/login only — signed-in renders after the tab content, at the
          very bottom of the page body. These two are the reason the student
          is on the page, and pushing them below the fold would hide the only
          thing they can act on. */}
      {panelMode && panelMode !== "signed-in" && (
        <StudentAuthPanel slug={slug} mode={panelMode} locale={locale} />
      )}

      {/* Teacher-facing. Used to be English and static, on the assumption
          Jenn's UI was always English — it now follows `locale` like
          everything else on this page, which is why this is no longer a bare
          string. Still no client component needed: the text is server-
          rendered same as before. Rendered here rather than inside
          StudentAuthPanel because both notices name the STUDENT, and the
          student's name is deliberately absent from the public page. Keeping
          it on a teacher-only branch is what stops a public visitor's HTML
          from ever containing it. */}
      {gate === "unclaimed" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          <p className="mb-2">
            {strings.student.page.unclaimedNotice(group.name)}
          </p>
          <code className="break-all text-xs">
            /g/{slug}?k={group.chatToken}
          </code>
        </div>
      )}

      {gate === "teacher-stale" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          {strings.student.page.staleNotice(group.name)}
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
              role="teacher"
              onAddLink={addShelfLink.bind(null, group.id)}
              onAddPage={addShelfPage.bind(null, group.id)}
              onAddPdf={addShelfPdf.bind(null, group.id)}
              locale={locale}
            />
          )}
        </TeacherInbox>
      ) : unlocked ? (
        <StreamProvider url={streamUrl({ isTeacher: false, slug })}>
          {body}
          <ChatFab
            slug={slug}
            locale={locale}
            labels={{
              title: strings.chat.title,
              empty: strings.chat.empty,
              placeholder: strings.chat.placeholder,
              send: strings.chat.send,
              close: strings.common.close,
              // Never shown — a student has no list to go back to — but the
              // panel's label type asks for it.
              back: strings.chat.back,
              locale: toBCP47(locale),
              today: strings.common.today,
              // Never shown either: onDeleteMessage is not passed here.
              deleteMessage: strings.chat.deleteMessage,
            }}
          />
          {/* No onAddPage: a student uploads a PDF or adds a link, not a
              whole website. addShelfPage keeps its guard on the server; what
              changed is which control is drawn. */}
          <ShelfFab
            role="student"
            onAddLink={addShelfLink.bind(null, group.id)}
            onAddPdf={addShelfPdf.bind(null, group.id)}
            locale={locale}
          />
        </StreamProvider>
      ) : (
        body
      )}

      {/* Signed-in only, and only reachable here: panelMode is "signed-in"
          exclusively for an unlocked, non-teacher visitor (authPanelMode
          returns null for the teacher in every state), which is exactly the
          StreamProvider branch above. Rendered after all of it — the tab
          content, the chat, the shelf FAB — so a sign-out control sits below
          everything the student came for rather than above it. */}
      {panelMode === "signed-in" && (
        <StudentAuthPanel slug={slug} mode={panelMode} locale={locale} />
      )}
    </main>
  );
}
