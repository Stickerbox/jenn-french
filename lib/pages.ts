import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/page-slug";

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

  const page = await prisma.page.upsert({
    where: { slug },
    create: { slug, title: input.title, html: input.html },
    update: { title: input.title, html: input.html },
    select: { id: true },
  });

  if (input.groupIds) {
    // Replace the whole set rather than diffing it: the caller always sends
    // the complete list, and one transaction is easier to reason about than
    // an add/remove pair that could half-apply.
    await prisma.$transaction([
      prisma.pageGroup.deleteMany({ where: { pageId: page.id } }),
      ...input.groupIds.map((groupId) =>
        prisma.pageGroup.create({ data: { pageId: page.id, groupId } }),
      ),
    ]);
  }

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

export function listPagesForGroup(groupId: string) {
  return prisma.page.findMany({
    where: { groups: { some: { groupId } } },
    orderBy: { createdAt: "desc" },
    select: { slug: true, title: true, createdAt: true },
  });
}

export async function listPagesForAdmin() {
  const pages = await prisma.page.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  });

  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    groupIds: page.groups.map((g) => g.group.id),
    groupNames: page.groups.map((g) => g.group.name),
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
