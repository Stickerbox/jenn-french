"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import {
  getPageForAdmin,
  savePage,
  setPageThumbnail,
  updatePageMeta,
  type SavePageInput,
} from "@/lib/pages";
import { validatePageHtml } from "@/lib/page-html";
import { validatePagePdf } from "@/lib/page-pdf";
import { validatePageThumb } from "@/lib/page-thumb";
import { parseLinkUrl } from "@/lib/link-url";
import { readPageKind } from "@/lib/page-kind";
import { canStudentDelete, shelfRole, type ShelfRole } from "@/lib/shelf-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { titleFromUrl } from "@/lib/link-title";
import { titleFromHtml } from "@/lib/page-title";
import { inlinePage, type SkippedRef } from "@/lib/page-inline";
import { readWorksheetField } from "@/lib/worksheet-field";
import { currentStrings } from "@/lib/locale";

// currentStrings() rather than a threaded argument, the same choice
// app/actions.ts makes and for the same reason: every action below already
// runs inside a "use server" request, so headers() is always in scope.
//
// These "Unauthorized" throws are reachable from BOTH audiences — Jenn's own
// admin forms, where they surface via err.message, and a student's ShelfFab,
// which discards err.message entirely and always shows its own static
// dictionary sentence (strings.student.shelf.*). Translating this string
// costs nothing on the student path and fixes the teacher one, so it is
// translated regardless of which caller happens to reach it today.
async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.unauthorized);
  }
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
  if (!group) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.unauthorized);
  }

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
  if (!role) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.unauthorized);
  }
  return role;
}

// The edit form still names a page: a published title stays editable even
// though its slug is frozen at creation.
export type PageInput = {
  title: string;
  html: string;
  groupIds: string[];
  worksheet: boolean;
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

async function requireTitle(value: string): Promise<string> {
  const title = value.trim();
  if (!title) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.titleRequired);
  }
  return title;
}

async function validatePage(input: PageInput) {
  const title = await requireTitle(input.title);
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
      const strings = await currentStrings();
      throw new Error(strings.admin.actions.groupDeletedMidEdit);
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
  const { title, html } = await validatePage(input);
  const inlined = await inlinePage(html);

  await saveOrExplain({
    slug,
    kind: "html",
    title,
    html: inlined.html,
    groupIds: input.groupIds,
  });

  // savePage does not write `worksheet` — see updatePageMeta. An html edit
  // therefore needs both calls: the document through savePage, the metadata
  // through the function that owns it. `title` here, not `input.title` — it is
  // the trimmed value validatePage already produced, and the raw prop would
  // silently overwrite what saveOrExplain just stored two lines above.
  await updatePageMeta(slug, {
    title,
    groupIds: input.groupIds,
    worksheet: input.worksheet,
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
  const title = await requireTitle(String(formData.get("title") ?? ""));

  const file = formData.get("pdf");
  // Size and not presence: an untouched file input serialises as an empty File
  // rather than being absent, and "she changed the title without choosing a new
  // document" is the common case on the edit screen.
  if (!(file instanceof File) || file.size === 0) return { title, bytes: null };

  const validated = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
  if (!validated.ok) throw new Error(validated.error);
  return { title, bytes: validated.bytes };
}

// The thumbnail field of a pdf submission, or null.
//
// A bad thumbnail is NOT a failed upload. The document is the thing being saved
// and the glyph is a working fallback, so a rejected or absent preview is
// dropped silently rather than turned into an error about a nicety she did not
// ask for. Every other validation failure in these actions is reported; this one
// deliberately is not.
async function readThumb(formData: FormData): Promise<Uint8Array | null> {
  const field = formData.get("thumb");
  if (!(field instanceof File) || field.size === 0) return null;

  const validated = validatePageThumb(new Uint8Array(await field.arrayBuffer()));
  return validated.ok ? validated.bytes : null;
}

function readGroupIds(formData: FormData): string[] {
  return formData
    .getAll("groupIds")
    .map(String)
    .filter((id) => id !== "");
}

// Teacher-only, like createPage — because this is the ADMIN's upload, which
// takes an audience and can put a PDF on any shelf or on several. A student
// uploading to their own shelf goes through addShelfPdf below, which is
// authorised by requireShelfRole and curried on one group. Two entry points
// because they answer to different authorities, not because the bytes differ.
export async function createPdfPage(formData: FormData): Promise<string> {
  await requireTeacher();
  const { title, bytes } = await readPdfForm(formData);
  if (!bytes) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.pdfRequired);
  }

  const slug = await saveOrExplain({
    slug: null,
    kind: "pdf",
    title,
    pdf: bytes,
    pdfSize: bytes.byteLength,
    thumb: await readThumb(formData),
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
  const worksheet = readWorksheetField(formData);

  if (bytes) {
    await saveOrExplain({
      slug,
      kind: "pdf",
      title,
      pdf: bytes,
      pdfSize: bytes.byteLength,
      // Only read beside a new file. A form submitted without one has no new
      // preview to offer, and the branch below must never be handed a thumbnail
      // it would have to decide what to do with: writing null there would erase
      // a good one.
      thumb: await readThumb(formData),
      groupIds,
    });
    // savePage does not write `worksheet` — see updatePageMeta. A replaced pdf
    // still needs this second call so the tick lands on the new row too.
    await updatePageMeta(slug, { title, groupIds, worksheet });
  } else {
    // No new document staged, so this is a rename or a change of audience.
    // Going through savePage would mean reading the blob back and writing it
    // again to change a string.
    await updatePageMeta(slug, { title, groupIds, worksheet });
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

// Stores a captured preview for either kind of page — an html document or a
// pdf. The picture is taken in the browser, against the page as it is already
// stored — html via components/html-thumbnail.ts, pdf via
// components/pdf-thumbnail.ts's renderAndStorePdfThumbnail (ThumbBackfill's
// retry for a student's upload whose own render didn't finish in time) — so
// this only ever writes what it is handed.
//
// Teacher-only, and the narrowness is deliberate rather than an oversight.
// Publishing an html document is teacher-only again now that the student's FAB
// offers a link and a PDF, and a student's own PDF thumbnail still arrives
// inside its own upload's FormData under requireShelfRole rather than through
// this action. One authority per path, neither widened: there is no route by
// which a student reaches this.
//
// A rejected thumbnail is NOT an error and returns silently, exactly as
// readThumb documents. The document is already saved; this is decoration on top
// of it, and the fallback is the live iframe, which is a working preview.
export async function setPageThumb(
  slug: string,
  formData: FormData,
): Promise<void> {
  await requireTeacher();

  const thumb = await readThumb(formData);
  if (!thumb) return;

  await setPageThumbnail(slug, thumb);
  revalidatePages(slug);
}

// The student page's add-a-PDF, for either party. The third sibling of
// addShelfLink and addShelfPage, authorised by the same requireShelfRole — so
// the everyone group and an untokened visitor are refused by a rule that
// already exists and is already tested, rather than by a second one written
// here.
//
// WHY THIS IS SAFE TO OPEN TO STUDENTS, since the CLAUDE.md text said the
// opposite until this change. The refusal named one specific piece of work:
// canStudentDelete keyed off `kind`, so a student could only ever delete a row
// with a URL, and a student's own PDF would have been undeletable by them. That
// predicate was independently rewritten to key off `addedByStudent` — the kind
// used to stand in for it and stopped being able to — so a student's own PDF,
// assigned to their shelf alone, is ALREADY deletable by them, and
// deleteShelfLink already re-checks it server-side regardless of which controls
// a tile rendered. canStudentDelete needs no change, and changing it would be
// the wrong move.
//
// The other half of the refusal — unvalidated binary in the database, served
// from our own origin — is answered exactly as it is for Jenn: validatePagePdf
// checks the 3 MB cap and the %PDF- prefix, and /p/[slug]/pdf serves it under
// nosniff with a Content-Disposition built by contentDispositionInline. What
// changes is who can reach it, and the honest statement of that is that a
// student can now put 3 MB of bytes on a public slug.
//
// The bytes arrive as a File in FormData rather than base64 because base64
// costs a third more, and 3 MB of PDF would arrive as 4 MB against nginx's 4m.
export async function addShelfPdf(
  groupId: string,
  formData: FormData,
): Promise<void> {
  const role = await requireShelfRole(groupId);

  const { title, bytes } = await readPdfForm(formData);
  if (!bytes) {
    const strings = await currentStrings();
    throw new Error(strings.admin.actions.pdfRequired);
  }

  const slug = await saveOrExplain({
    slug: null,
    kind: "pdf",
    title,
    pdf: bytes,
    pdfSize: bytes.byteLength,
    thumb: await readThumb(formData),
    // The shelf she is on, and no audience picker: the action is curried on the
    // group id, so there is nothing for the caller to choose or to get wrong.
    groupIds: [groupId],
    addedByStudent: role === "student",
  });

  revalidatePages(slug);
}

// Everything the edit overlay needs to open on one page, fetched WHEN IT OPENS
// rather than shipped with the list — following loadConversation, and for the
// same reason: the payload contains a whole document, and a shelf renders many
// tiles. Shipping it with the list would put every page's html into the HTML of
// every page that lists them.
//
// Returns null for a missing row AND for a link row, so the overlay agrees with
// /admin/pages/[slug], which already 404s on a link. Rendering an upload form
// over a row that can never accept one is the failure both are avoiding.
export async function loadPageForEdit(slug: string): Promise<{
  page: NonNullable<Awaited<ReturnType<typeof getPageForAdmin>>>;
  groups: { id: string; name: string }[];
} | null> {
  await requireTeacher();

  const page = await getPageForAdmin(slug);
  if (!page || page.kind === "link") return null;

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return { page, groups };
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
    if (!allowed) {
      const strings = await currentStrings();
      throw new Error(strings.admin.actions.unauthorized);
    }
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
