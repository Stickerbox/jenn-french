import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/page-slug";
import { effectivePages } from "@/lib/effective-pages";
import { readPageKind, type PageKind } from "@/lib/page-kind";
import { applyPins } from "@/lib/page-pins";

type SaveCommon = {
  // null means "derive one from the title"; a value means "create or replace
  // the page at exactly this slug", which is how a corrected page is
  // republished to a link students already have.
  slug: string | null;
  title: string;
  // null leaves existing group assignments untouched.
  groupIds: string[] | null;
};

export type SavePageInput = SaveCommon &
  (
    | { kind: "html"; html: string }
    | { kind: "link"; url: string; addedByStudent?: boolean }
  );

export async function savePage(input: SavePageInput): Promise<string> {
  const slug = input.slug ?? (await deriveSlug(input.title));

  // Both columns are written every time, one of them to null. Setting only the
  // populated one would leave stale html behind if an html page were ever
  // replaced by a link at the same slug, and readPageKind would then have two
  // populated columns to choose between.
  const columns =
    input.kind === "html"
      ? { kind: "html", html: input.html, url: null }
      : { kind: "link", html: null, url: input.url };

  // One interactive transaction, not an upsert followed by a separate group
  // write: a failing group assignment used to leave the page row committed
  // with no groups, which is invisible in every list and cannot be repaired
  // by retrying, because the retry derives a fresh slug.
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.upsert({
      where: { slug },
      create: {
        slug,
        title: input.title,
        ...columns,
        addedByStudent: input.kind === "link" && input.addedByStudent === true,
      },
      // addedByStudent is deliberately absent here: who added a row is a fact
      // about its creation, and an edit must not rewrite it.
      update: { title: input.title, ...columns },
      select: { id: true },
    });

    if (!input.groupIds) return;

    // Replace the whole set rather than diffing it: the caller always sends
    // the complete list, and a duplicate id would otherwise collide with the
    // composite primary key.
    await tx.pageGroup.deleteMany({ where: { pageId: page.id } });
    for (const groupId of new Set(input.groupIds)) {
      await tx.pageGroup.create({ data: { pageId: page.id, groupId } });
    }
  });

  return slug;
}

async function deriveSlug(title: string): Promise<string> {
  const taken = await prisma.page.findMany({ select: { slug: true } });
  return uniqueSlug(
    slugify(title),
    taken.map((p) => p.slug),
  );
}

// `html` is deliberately absent. It holds a whole document, and selecting it to
// render a grid of thumbnails would ship every page's markup to draw a list of
// titles.
const SHELF_SELECT = {
  id: true,
  slug: true,
  title: true,
  createdAt: true,
  kind: true,
  url: true,
  addedByStudent: true,
} as const;

export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, html: true, kind: true, url: true },
  });
}

export async function listPagesForGroup(groupId: string) {
  // Three queries rather than one: the everyone group's pages are the same set
  // for every student, and keeping them separate is what lets effectivePages
  // own the merge rule and be tested without a database. The pins are this
  // shelf's only — a pin on another student's shelf is none of this one's
  // business.
  const [own, everyone, pins] = await Promise.all([
    prisma.page.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { createdAt: "desc" },
      select: SHELF_SELECT,
    }),
    prisma.page.findMany({
      where: { groups: { some: { group: { isEveryone: true } } } },
      orderBy: { createdAt: "desc" },
      select: SHELF_SELECT,
    }),
    prisma.pagePin.findMany({
      where: { groupId },
      select: { pageId: true, pinnedAt: true },
    }),
  ]);

  const merged = effectivePages(own, everyone).map((page) => ({
    ...page,
    kind: readPageKind(page),
  }));

  return applyPins(merged, pins);
}

export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      ...SHELF_SELECT,
      groups: {
        select: {
          group: { select: { id: true, name: true, isEveryone: true } },
        },
      },
      // Every shelf's pins, not one shelf's: the admin shows all pages, and
      // which pin applies depends on the student chip the client has active.
      pins: { select: { groupId: true, pinnedAt: true } },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    createdAt: page.createdAt,
    kind: readPageKind(page),
    url: page.url,
    addedByStudent: page.addedByStudent,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
    // Drives both the tile's marker and the filter: a page shared with
    // everyone is on every student's shelf, so it must survive a filter for
    // any one of them.
    sharedWithEveryone: page.groups.some((g) => g.group.isEveryone),
    pins: page.pins,
  }));
}

export async function getPageForAdmin(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      html: true,
      kind: true,
      url: true,
      groups: { select: { groupId: true } },
    },
  });
  if (!page) return null;

  return {
    slug: page.slug,
    title: page.title,
    html: page.html,
    kind: readPageKind(page),
    url: page.url,
    groupIds: page.groups.map((g) => g.groupId),
  };
}

// Re-exported so callers that only need the shelf row's shape do not import
// three modules to describe one thing.
export type ShelfPage = Awaited<ReturnType<typeof listPagesForGroup>>[number];
export type AdminPage = Awaited<ReturnType<typeof listPagesForAdmin>>[number];
export type { PageKind };
