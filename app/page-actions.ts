"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage, type SavePageInput } from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";
import { parseLinkUrl } from "@/lib/link-url";
import { readPageKind } from "@/lib/page-kind";
import { canStudentDelete, shelfRole, type ShelfRole } from "@/lib/shelf-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

// The write-side counterpart of the page's `unlocked` flag. Callers pass a
// group id because that is what the client already holds; the token is read
// from the cookie here, never from an argument, so a client cannot assert one.
async function requireShelfRole(groupId: string): Promise<ShelfRole> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { slug: true, isEveryone: true, chatToken: true },
  });
  if (!group) throw new Error("Unauthorized");

  const teacher = await getCurrentTeacher();
  const cookieStore = await cookies();
  const role = shelfRole({
    isTeacher: Boolean(teacher),
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented: readToken(
      undefined,
      cookieStore.get(cookieNameFor(group.slug))?.value,
    ),
  });
  if (!role) throw new Error("Unauthorized");
  return role;
}

export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

export type LinkInput = {
  title: string;
  url: string;
  groupIds: string[];
};

function requireTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("A title is required.");
  return title;
}

function validatePage(input: PageInput) {
  const title = requireTitle(input.title);
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title, html: html.html };
}

function validateLink(input: { title: string; url: string }) {
  const url = parseLinkUrl(input.url);
  if (!url.ok) throw new Error(url.error);
  // A link with no title falls back to its host, so adding one is two fields
  // and not three when she is in a hurry.
  const title = input.title.trim() || new URL(url.url).hostname.replace(/^www\./, "");
  return { title, url: url.url };
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
  const { title, html } = validatePage(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePage(slug: string, input: PageInput): Promise<void> {
  await requireTeacher();
  const { title, html } = validatePage(input);

  await saveOrExplain({ slug, kind: "html", title, html, groupIds: input.groupIds });

  revalidatePages(slug);
}

// The admin's own add-a-link. Teacher-only and free to target any group,
// including everyone — that is the shared shelf and filling it is her job.
export async function createLink(input: LinkInput): Promise<string> {
  await requireTeacher();
  const { title, url } = validateLink(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "link",
    title,
    url,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return slug;
}

// The student page's add-a-link, for either party. groupId is bound on the
// server so the client never carries it.
export async function addShelfLink(
  groupId: string,
  input: { title: string; url: string },
): Promise<void> {
  const role = await requireShelfRole(groupId);
  const { title, url } = validateLink(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "link",
    title,
    url,
    groupIds: [groupId],
    addedByStudent: role === "student",
  });

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

// From the student page. The teacher may remove anything; a student may remove
// only their own link, and only when nobody else can see it.
export async function deleteShelfLink(
  groupId: string,
  slug: string,
): Promise<void> {
  const role = await requireShelfRole(groupId);

  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      kind: true,
      url: true,
      addedByStudent: true,
      groups: { select: { groupId: true } },
    },
  });
  // Already gone. A no-op, for the reason deleteMany is used above.
  if (!page) return;

  if (role !== "teacher") {
    const allowed = canStudentDelete(
      {
        kind: readPageKind(page),
        addedByStudent: page.addedByStudent,
        groupIds: page.groups.map((g) => g.groupId),
      },
      groupId,
    );
    if (!allowed) throw new Error("Unauthorized");
  }

  await prisma.page.deleteMany({ where: { id: page.id } });

  revalidatePages(slug);
}

// One shelf's pin. groupId is first so the caller can bind it.
export async function setShelfPin(
  groupId: string,
  slug: string,
  pinned: boolean,
): Promise<void> {
  await requireShelfRole(groupId);

  const page = await prisma.page.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!page) return;

  if (pinned) {
    // upsert rather than create: pinning something already pinned from a stale
    // tab should refresh the timestamp, not throw a unique-constraint error.
    await prisma.pagePin.upsert({
      where: { pageId_groupId: { pageId: page.id, groupId } },
      create: { pageId: page.id, groupId },
      update: { pinnedAt: new Date() },
    });
  } else {
    await prisma.pagePin.deleteMany({ where: { pageId: page.id, groupId } });
  }

  revalidatePages(slug);
}
