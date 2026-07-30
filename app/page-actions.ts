"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage } from "@/lib/pages";
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
  revalidatePath("/g/[slug]/pages", "page");
}

export async function createPage(input: PageInput): Promise<string> {
  await requireTeacher();
  const { title, html } = validate(input);

  const slug = await savePage({
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

  await savePage({ slug, title, html, groupIds: input.groupIds });

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
