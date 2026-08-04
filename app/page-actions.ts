"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { savePage, updatePageMeta, type SavePageInput } from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";
import { validatePagePdf } from "@/lib/page-pdf";
import { parseLinkUrl } from "@/lib/link-url";
import { readPageKind } from "@/lib/page-kind";
import { canStudentDelete, shelfRole, type ShelfRole } from "@/lib/shelf-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { titleFromUrl } from "@/lib/link-title";
import { titleFromHtml } from "@/lib/page-title";
import { inlinePage, type SkippedRef } from "@/lib/page-inline";

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

// The edit form still names a page: a published title stays editable even
// though its slug is frozen at creation.
export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
};

// Creating one does not. The title comes from the document, so the form is a
// paste and nothing else.
export type NewPageInput = {
  html: string;
  groupIds: string[];
};

// One shape for both actions, so PageEditor does not need to know which of them
// it is calling. updatePage returns the slug it was handed.
export type PageSaveResult = { slug: string; skipped: SkippedRef[] };

export type LinkInput = {
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

// The create path, where nobody typed a title. "Page" is a deliberate last
// resort: uniqueSlug turns a run of them into page, page-2, page-3, which is
// ugly but reachable, and the title stays editable at /admin/pages/<slug>
// afterwards. The slug does not — students bookmark it.
// Narrower than NewPageInput: createPage passes the whole thing but
// addShelfPage never carries a groupIds field, so the shared validator only
// asks for what it actually reads.
function validateNewPage(input: { html: string }) {
  const html = validatePageHtml(input.html);
  if (!html.ok) throw new Error(html.error);
  return { title: titleFromHtml(html.html) ?? "Page", html: html.html };
}

// The title is derived here rather than in either form, so the two callers
// cannot disagree about it and neither can skip it. titleFromUrl makes no
// request — see lib/link-title.ts.
function validateLink(input: { url: string }) {
  const url = parseLinkUrl(input.url);
  if (!url.ok) throw new Error(url.error);
  return { title: titleFromUrl(url.url), url: url.url };
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

export async function createPage(input: NewPageInput): Promise<PageSaveResult> {
  await requireTeacher();
  const { title, html } = validateNewPage(input);
  const inlined = await inlinePage(html);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html: inlined.html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return { slug, skipped: inlined.skipped };
}

export async function updatePage(
  slug: string,
  input: PageInput,
): Promise<PageSaveResult> {
  await requireTeacher();
  const { title, html } = validatePage(input);
  const inlined = await inlinePage(html);

  await saveOrExplain({
    slug,
    kind: "html",
    title,
    html: inlined.html,
    groupIds: input.groupIds,
  });

  revalidatePages(slug);
  return { slug, skipped: inlined.skipped };
}

// Bytes arrive as a File in FormData, not as a base64 string, and this is a
// deliberate departure from the rule in 2026-07-30-uploaded-pages-design.md
// that a page action "takes a string and never handles a file". The reason is
// arithmetic: base64 costs a third more, and 3 MB of PDF would arrive as 4 MB
// of payload against a 4 MB nginx limit — a 413 before Next ever saw it.
async function readPdfForm(
  formData: FormData,
): Promise<{ title: string; bytes: Uint8Array | null }> {
  const title = requireTitle(String(formData.get("title") ?? ""));

  const file = formData.get("pdf");
  // Size and not presence: an untouched file input serialises as an empty File
  // rather than being absent, and "she changed the title without choosing a new
  // document" is the common case on the edit screen.
  if (!(file instanceof File) || file.size === 0) return { title, bytes: null };

  const validated = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
  if (!validated.ok) throw new Error(validated.error);
  return { title, bytes: validated.bytes };
}

function readGroupIds(formData: FormData): string[] {
  return formData
    .getAll("groupIds")
    .map(String)
    .filter((id) => id !== "");
}

// Teacher-only, like createPage. A student upload would put unvalidated binary
// in the database and served from our own origin, and would need
// canStudentDelete extended from rows-with-a-url to rows-with-a-blob — a
// separate decision, not one to smuggle in here.
export async function createPdfPage(formData: FormData): Promise<string> {
  await requireTeacher();
  const { title, bytes } = await readPdfForm(formData);
  if (!bytes) throw new Error("A PDF file is required.");

  const slug = await saveOrExplain({
    slug: null,
    kind: "pdf",
    title,
    pdf: bytes,
    pdfSize: bytes.byteLength,
    groupIds: readGroupIds(formData),
  });

  revalidatePages(slug);
  return slug;
}

export async function updatePdfPage(
  slug: string,
  formData: FormData,
): Promise<void> {
  await requireTeacher();
  const { title, bytes } = await readPdfForm(formData);
  const groupIds = readGroupIds(formData);

  if (bytes) {
    await saveOrExplain({
      slug,
      kind: "pdf",
      title,
      pdf: bytes,
      pdfSize: bytes.byteLength,
      groupIds,
    });
  } else {
    // No new document staged, so this is a rename or a change of audience.
    // Going through savePage would mean reading the blob back and writing it
    // again to change a string.
    await updatePageMeta(slug, { title, groupIds });
  }

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
  input: { url: string },
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

// The student page's add-a-page, for either party. The sibling of
// addShelfLink, authorised by the same requireShelfRole — so the everyone
// group and an untokened visitor are refused by a rule that already exists and
// is already tested, rather than by a second one written here.
export async function addShelfPage(
  groupId: string,
  input: { html: string },
): Promise<void> {
  const role = await requireShelfRole(groupId);
  const { title, html } = validateNewPage(input);

  const slug = await saveOrExplain({
    slug: null,
    kind: "html",
    title,
    html,
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
      pdfSize: true,
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
