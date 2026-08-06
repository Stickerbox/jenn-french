import { redirect } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertGlobalCard,
  createGroup,
  deleteGlobalCard,
  deleteGroup,
  resetStudentSignIn,
} from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminChrome } from "@/components/admin/AdminChrome";
import { GroupList } from "@/components/admin/GroupList";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";
import { parseAdminTab } from "@/lib/admin-tab";
import { listConversations } from "@/lib/inbox";
import {
  createPage,
  createPdfPage,
  createLink,
  deletePage,
  setShelfPin,
} from "@/app/page-actions";
import { listPagesForAdmin } from "@/lib/pages";
import { PagesTabClient } from "@/components/admin/PagesTabClient";
import { ThumbBackfill } from "@/components/admin/ThumbBackfill";
import { readPageKind } from "@/lib/page-kind";
import { pageVersion } from "@/lib/page-version";
import { TeacherInbox } from "@/components/chat/TeacherInbox";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string; edit?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  // Read once, at the top, and threaded through every tab below — the same
  // pattern app/g/[slug]/page.tsx uses. Jenn's own browser locale, not a fixed
  // English: the admin used to be English unconditionally, and that split is
  // retired (see CLAUDE.md's Auth / language note).
  const locale = await currentLocale();
  const strings = getStrings(locale);

  const { date, tab, edit } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  // ?edit= implies the Pages tab. A relative "?edit=..." href replaces the whole
  // query string rather than merging into it, so the pencil has to carry
  // ?tab=pages itself — and it does — but a hand-typed or bookmarked ?edit=
  // would otherwise land on the daily word with an overlay that never mounts,
  // which reads as the link being broken. The edit param is meaningless on the
  // other two tabs, so there is nothing to disambiguate.
  const active = parseAdminTab(tab ?? (edit ? "pages" : undefined));

  // Fetched here rather than inside PagesTab, which is where it used to live:
  // the FAB is outside the tab bodies and needs the audience list on every one
  // of them. This knowingly weakens "each tab runs only its own queries" below
  // — one indexed read of a table with a handful of rows is what the control
  // costs to be in a single place.
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, isEveryone: true },
  });

  return (
    // relative + the card page's own gradient, matching /g/[slug]: Task I
    // brings the admin's chrome into the flashcard palette Jenn's students
    // already see, on the theory that she should see her own pages the way
    // they do (see components/ui/Tile.tsx and PageTile.tsx, the precedent).
    <main
      className="relative min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      {/* Positioned against `main`, not the header below — the header is
          capped at 560px to match /g/[slug]'s rhythm, and anchoring to it
          would have pulled this pill in from the page's actual right edge.
          Mirrors the "← Back to admin" pill /g/[slug] shows a teacher,
          reflected to the opposite corner. */}
      <form action={logout} className="absolute right-4 top-4 z-10">
        <button
          type="submit"
          className={cn(
            "flex min-h-[44px] items-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-1.5 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none",
            cardFocusRing,
          )}
        >
          {strings.admin.header.logOut}
        </button>
      </form>

      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
        {/* Same three lines /g/[slug] opens with, in the same order: the
            wordmark, then who this is (Admin), then who is looking (Hello
            Jenn!) — both drawn from the dictionary, so a browser set to
            French gets "Bonjour Jenn !" the same way a student's page does.
            Not a link, for the reason Task G removed the link on the student
            side: there is nowhere useful for Jenn to land pressing the site's
            own name from inside her own admin.

            mb-[var(--space-5)]: same named 32px unit as AdminTabs' own
            margin below it — see that file's comment; the two pages'
            headers now share one rhythm rather than two numbers that were
            merely close. */}
        <header className="mx-auto mb-[var(--space-5)] max-w-[560px] text-center">
          <h1
            className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
            style={{ fontSize: "clamp(30px, 5.5vw, 42px)", lineHeight: 1.15 }}
          >
            {strings.student.brand.wordmark}
          </h1>
          <div className="font-[family-name:var(--card-font-serif)] text-[15px] italic text-[var(--card-moss)]">
            {strings.admin.header.title}
          </div>
          <div className="mt-3 font-[family-name:var(--card-font-serif)] text-[19px] text-[var(--card-moss)]">
            {strings.admin.header.greeting}
          </div>
        </header>

        <AdminTabs active={active} date={selected} strings={strings} />

        <AdminChrome
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          onCreateStudent={createGroup}
          onCreateLink={createLink}
          onCreatePage={createPage}
          onCreatePdfPage={createPdfPage}
          locale={locale}
        >
          {active === "daily" && (
            <DailyWordTab
              selected={selected}
              today={today}
              locale={locale}
            />
          )}
          {active === "groups" && <GroupsTab locale={locale} />}
          {active === "pages" && (
            <PagesTab
              groups={groups}
              edit={edit ?? null}
              locale={locale}
            />
          )}
        </AdminChrome>
      </div>

      {/* Outside the width wrapper: the FAB is fixed-positioned and a
          max-width ancestor would have no effect, but nesting it inside a
          content column implies otherwise. */}
      <TeacherInbox />
    </main>
  );
}

async function DailyWordTab({
  selected,
  today,
  locale,
}: {
  selected: string;
  today: string;
  locale: Locale;
}) {
  const existingCard = await prisma.globalCard.findUnique({
    where: { date: new Date(`${selected}T00:00:00Z`) },
  });

  return (
    <>
      {/* Handed to the editor rather than placed here: the compose step is one
          centred column and the editing step is a two-column grid, and only
          the editor knows which one is on screen. */}
      <CardEditor
        key={selected}
        initialDate={selected}
        initialValues={toCardFormValues(existingCard)}
        datePicker={
          <AdminDatePicker
            basePath="/admin"
            selected={selected}
            today={today}
            locale={locale}
          />
        }
        onSubmit={upsertGlobalCard}
        onDelete={deleteGlobalCard}
        locale={locale}
      />
    </>
  );
}

// Each tab runs its own queries, apart from the group list the FAB above needs
// on all three.
async function GroupsTab({ locale }: { locale: Locale }) {
  // The group query stays as it is — including its email/claimedAt selection —
  // because this list includes the everyone row, which has no conversation and
  // so is absent from listConversations.
  const [groups, conversations] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    listConversations(),
  ]);
  const unread = new Map(conversations.map((c) => [c.groupId, c.unread]));

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          isEveryone: g.isEveryone,
          unread: unread.get(g.id) ?? 0,
          chatToken: g.chatToken,
          email: g.email,
          claimedAt: g.claimedAt,
        }))}
        onDelete={deleteGroup}
        onReset={resetStudentSignIn}
        locale={locale}
      />
    </div>
  );
}

// The group list arrives as a prop now: the page above already read it for the
// FAB, and a second identical query on this tab would be pure duplication.
async function PagesTab({
  groups,
  edit,
  locale,
}: {
  groups: { id: string; name: string; slug: string; isEveryone: boolean }[];
  // The slug whose editor is open, from ?edit=. Read here and handed down
  // rather than held in client state: see the pencil's comment in PageList.
  edit: string | null;
  locale: Locale;
}) {
  const pages = await listPagesForAdmin();

  // null when no row is flagged — a state the migration makes impossible, but
  // one the filter should degrade quietly on rather than crash.
  const everyoneName = groups.find((g) => g.isEveryone)?.name ?? null;

  // Derived from the list already fetched above rather than queried again: the
  // two facts it needs — the kind and whether a preview exists — are both in
  // SHELF_SELECT, and `thumb` itself is deliberately not, which is the whole
  // reason thumbAt is a separate column.
  //
  // Both kinds without a preview, not just html: a pdf row reaches here the
  // same way an html one always has, either published with no browser around
  // (POST /api/pages has none; a student's own upload has one, but
  // ShelfFab.submitPdf no longer waits out a slow render). `kind` rides along
  // so ThumbBackfill knows which renderer a given row needs without asking
  // readPageKind a second time.
  const missingThumbs = pages
    .map((page) => ({ page, kind: readPageKind(page) }))
    .filter(
      (row): row is { page: (typeof pages)[number]; kind: "html" | "pdf" } =>
        (row.kind === "html" || row.kind === "pdf") &&
        row.page.thumbAt === null,
    )
    .map(({ page, kind }) => ({
      slug: page.slug,
      version: pageVersion(page.updatedAt),
      kind,
    }));

  // No 560px cap out here, unlike the other tabs: the page grid uses the
  // whole 1152px so four tiles are worth looking at. PagesTabClient caps its
  // own controls.
  return (
    <>
      {/* Teacher-only, which /admin already guarantees for everything it
          renders — this needs no guard of its own, and adding one would imply
          the rest of the tab has a weaker one. */}
      <ThumbBackfill pages={missingThumbs} />
      <PagesTabClient
        pages={pages}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          isEveryone: g.isEveryone,
        }))}
        everyoneName={everyoneName}
        today={new Date()}
        onTogglePin={setShelfPin}
        onDelete={deletePage}
        edit={edit}
        locale={locale}
      />
    </>
  );
}
