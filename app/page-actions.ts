"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage, type SavePageInput } from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

function validate(input: PageInput) {
  const title = input.title.trim();
  if (!title) throw new Error("A title is required.");

  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);

  return { title, html: html.html };
}

// A page can belong to several groups, so every group's list is stale after a
// write. The route pattern with type "page" revalidates every instance of the
// dynamic route rather than one slug at a time.
function revalidatePages(slug: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/pages/${slug}`);
  revalidatePath(`/p/${slug}`);
  revalidatePath("/f/[token]", "page");
  // The files tab lives here as well, and a pin reorders it.
  revalidatePath("/g/[slug]", "page");
}

// The admin form is rendered with the group list as it was when the page
// loaded, but the teacher edits in her own time — a group can be deleted from
// another tab before she submits. savePage then hits the foreign-key
// constraint on PageGroup, and a raw Prisma message tells her nothing she can
// act on, so translate that one case into a retry instruction.
async function saveOrExplain(input: SavePageInput): Promise<string> {
  try {
    return await savePage(input);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      throw new Error(
        "One of those groups was just deleted — reload the page and try again.",
      );
    }
    throw err;
  }
}

export async function createPage(input: PageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validate(input);

  const slug = await saveOrExplain({
    slug: null,
    title,
    html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePage(slug: string, input: PageInput): Promise<void> {
  await requireTeacher();
  const { title, html } = validate(input);

  await saveOrExplain({ slug, title, html, groupIds: input.groupIds });

  revalidatePages(slug);
}

// deleteMany rather than delete: delete throws P2025 when the row is already
// gone, which turns a double-click or a stale tab into an error the teacher
// cannot act on.
export async function deletePage(slug: string): Promise<void> {
  await requireTeacher();

  await prisma.page.deleteMany({ where: { slug } });

  revalidatePages(slug);
}

export async function setPagePinned(
  slug: string,
  pinned: boolean,
): Promise<void> {
  await requireTeacher();

  // updateMany rather than update, for the reason deletePage uses deleteMany:
  // a stale tab pinning a page that has since been deleted should be a no-op,
  // not a P2025 the teacher cannot act on.
  await prisma.page.updateMany({
    where: { slug },
    data: { pinnedAt: pinned ? new Date() : null },
  });

  revalidatePages(slug);
}
