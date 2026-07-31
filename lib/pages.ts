import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/page-slug";
import { effectivePages } from "@/lib/effective-pages";

export type SavePageInput = {
  // null means "derive one from the title"; a value means "create or replace
  // the page at exactly this slug", which is how a corrected page is
  // republished to a link students already have.
  slug: string | null;
  title: string;
  html: string;
  // null leaves existing group assignments untouched.
  groupIds: string[] | null;
};

export async function savePage(input: SavePageInput): Promise<string> {
  const slug = input.slug ?? (await deriveSlug(input.title));

  // One interactive transaction, not an upsert followed by a separate group
  // write: a failing group assignment used to leave the page row committed
  // with no groups, which is invisible in every list and cannot be repaired
  // by retrying, because the retry derives a fresh slug.
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.upsert({
      where: { slug },
      create: { slug, title: input.title, html: input.html },
      update: { title: input.title, html: input.html },
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

export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, html: true },
  });
}

export async function listPagesForGroup(groupId: string) {
  // Two queries rather than one OR: the everyone group's pages are the same
  // set for every student, and keeping them separate is what lets
  // effectivePages own the merge rule and be tested without a database.
  const [own, everyone] = await Promise.all([
    prisma.page.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true },
    }),
    prisma.page.findMany({
      where: { groups: { some: { group: { isEveryone: true } } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, title: true, createdAt: true },
    }),
  ]);

  return effectivePages(own, everyone);
}

export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      groups: {
        select: {
          group: { select: { id: true, name: true, isEveryone: true } },
        },
      },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    createdAt: page.createdAt,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
    // Drives both the tile's marker and the filter: a page shared with
    // everyone is on every student's shelf, so it must survive a filter for
    // any one of them.
    sharedWithEveryone: page.groups.some((g) => g.group.isEveryone),
  }));
}

export async function getPageForAdmin(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      html: true,
      groups: { select: { groupId: true } },
    },
  });
  if (!page) return null;

  return {
    slug: page.slug,
    title: page.title,
    html: page.html,
    groupIds: page.groups.map((g) => g.groupId),
  };
}
