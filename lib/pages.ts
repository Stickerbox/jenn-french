import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/page-slug";
import { effectivePages } from "@/lib/effective-pages";
import { readPageKind, type PageKind } from "@/lib/page-kind";
import { applyPins } from "@/lib/page-pins";
import { applyVersions } from "@/lib/page-versions";
import { listShelfVersions } from "@/lib/version-store";

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
    | { kind: "html"; html: string; addedByStudent?: boolean }
    | { kind: "link"; url: string; addedByStudent?: boolean }
    | {
        kind: "pdf";
        pdf: Uint8Array;
        pdfSize: number;
        // Null when this upload had no renderable preview. Required rather than
        // optional so the compiler names every caller: a caller that quietly
        // omitted it would leave the PREVIOUS document's picture on the new
        // document, which is the one failure mode worse than having none.
        thumb: Uint8Array | null;
        // Present on all three branches now. This one said uploading a PDF was
        // teacher-only and the union said so by not offering the field; that
        // stopped being true when addShelfPdf joined addShelfLink and
        // addShelfPage under the same requireShelfRole guard.
        addedByStudent?: boolean;
      }
  );

export async function savePage(input: SavePageInput): Promise<string> {
  const slug = input.slug ?? (await deriveSlug(input.title));

  // Every content column is written every time, all but one of them to null.
  // The shape is identical across the branches on purpose: that is the
  // invariant made visible. Setting only the populated one would leave stale
  // html behind if an html page were replaced by a pdf at the same slug, and
  // readPageKind would then have two populated columns to choose between.
  //
  // The two thumbnail columns are in that set for a reason stronger than the
  // one above. A MISSING preview is a glyph. A STALE preview is a picture of the
  // previous document sitting under the new document's title, which reads as a
  // working feature showing the wrong thing.
  const columns =
    input.kind === "html"
      ? {
          kind: "html",
          html: input.html,
          url: null,
          pdf: null,
          pdfSize: null,
          thumb: null,
          thumbAt: null,
        }
      : input.kind === "link"
        ? {
            kind: "link",
            html: null,
            url: input.url,
            pdf: null,
            pdfSize: null,
            thumb: null,
            thumbAt: null,
          }
        : {
            kind: "pdf",
            html: null,
            url: null,
            // Buffer on the way in, matching how Passkey.publicKey is written.
            pdf: Buffer.from(input.pdf),
            pdfSize: input.pdfSize,
            thumb: input.thumb ? Buffer.from(input.thumb) : null,
            thumbAt: input.thumb ? new Date() : null,
          };

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
        // All three kinds carry it. A pdf row used to be excluded here because
        // uploading one was teacher-only; a student can now put one on their
        // own shelf, and this is the flag canStudentDelete keys off to let them
        // take it back down again.
        addedByStudent: input.addedByStudent === true,
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

// `html` and `pdf` are deliberately absent. One holds a whole document and the
// other a whole file; selecting either to render a grid of thumbnails would ship
// every page's contents to draw a list of titles. `pdfSize` is here because it
// is small, because readPageKind needs it, and because the tile prints it.
const SHELF_SELECT = {
  id: true,
  slug: true,
  title: true,
  createdAt: true,
  // The preview's cache key. Cheap to select and needed by every tile; see
  // lib/page-version.ts.
  updatedAt: true,
  kind: true,
  url: true,
  pdfSize: true,
  // The signal, not the picture. `thumb` is deliberately absent for the same
  // reason `html` is: selecting a blob to draw a grid of titles ships the thing
  // the grid was avoiding. The tile turns this timestamp into a ?v= on
  // /p/[slug]/thumb and the browser fetches the bytes only for tiles it renders.
  thumbAt: true,
  addedByStudent: true,
  // Cheap, and every tile needs it: it decides the tile's destination and
  // whether a badge can appear at all.
  worksheet: true,
} as const;

export function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      html: true,
      kind: true,
      url: true,
      pdfSize: true,
      updatedAt: true,
    },
  });
}

// Its own query, and the only one that selects `pdf`. Same reasoning as
// SHELF_SELECT's omission: a caller reaching for a list must not be able to
// pull 3 MB per row by forgetting which helper it called.
export function getPagePdf(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      kind: true,
      url: true,
      pdf: true,
      pdfSize: true,
    },
  });
}

// Selects the blob, unlike every shelf query. Its one caller is the route that
// serves it, which needs exactly this row and nothing else on the page.
export function getPageThumb(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    select: {
      // kind, url and pdfSize are here because readPageKind requires all three —
      // see its comment about pdfSize being a required argument precisely so a
      // caller cannot silently omit the pdf signal.
      kind: true,
      url: true,
      pdfSize: true,
      thumb: true,
      thumbAt: true,
    },
  });
}

export async function listPagesForGroup(groupId: string) {
  // Three queries rather than one: the everyone group's pages are the same set
  // for every student, and keeping them separate is what lets effectivePages
  // own the merge rule and be tested without a database. The pins are this
  // shelf's only — a pin on another student's shelf is none of this one's
  // business.
  const [own, everyone, pins, versions] = await Promise.all([
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
    listShelfVersions(groupId),
  ]);

  const merged = effectivePages(own, everyone).map((page) => ({
    ...page,
    kind: readPageKind(page),
  }));

  // Pins first, then versions: applyPins is what sectionPages reads, and
  // applyVersions only adds a field neither of them looks at.
  return applyVersions(applyPins(merged, pins), versions);
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
    updatedAt: page.updatedAt,
    kind: readPageKind(page),
    url: page.url,
    pdfSize: page.pdfSize,
    thumbAt: page.thumbAt,
    addedByStudent: page.addedByStudent,
    worksheet: page.worksheet,
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
      pdfSize: true,
      worksheet: true,
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
    pdfSize: page.pdfSize,
    worksheet: page.worksheet,
    groupIds: page.groups.map((g) => g.groupId),
  };
}

// Title and audience only, for a page whose content is already stored. Kept out
// of savePage deliberately: that function writes every content column on every
// call, one of them to null, and a "leave the bytes alone" case inside it would
// put a hole in the one place that invariant is enforced. It also saves reading
// and rewriting 3 MB to change a title.
export async function updatePageMeta(
  slug: string,
  input: { title: string; groupIds: string[]; worksheet: boolean },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.findUnique({
      where: { slug },
      select: { id: true },
    });
    // Already gone. A no-op, for the reason deletes use deleteMany.
    if (!page) return;

    await tx.page.update({
      where: { id: page.id },
      // `worksheet` is here and not in savePage, which is the same split
      // `title` already makes: it is metadata, so re-flagging must not read and
      // rewrite 3 MB of PDF, and savePage's every-content-column invariant
      // keeps no "leave this alone" hole in it. The consequence worth knowing:
      // a republish at the same slug KEEPS the flag, the way addedByStudent
      // survives an edit.
      data: { title: input.title, worksheet: input.worksheet },
    });

    // Replace the whole set rather than diffing it, as savePage does: the
    // caller always sends the complete list.
    await tx.pageGroup.deleteMany({ where: { pageId: page.id } });
    for (const groupId of new Set(input.groupIds)) {
      await tx.pageGroup.create({ data: { pageId: page.id, groupId } });
    }
  });
}

// Writes the two thumbnail columns and NOTHING else — its own function beside
// updatePageMeta for exactly the reason updatePageMeta exists. savePage writes
// every content column on every call, and that flat invariant is the only thing
// stopping a replaced document from keeping the previous document's picture; a
// "leave the content alone" case inside it would put a hole in the one place
// the invariant is enforced.
//
// The order this runs in is deliberate and is the whole design: savePage nulls
// both columns, and the capture happens AFTERWARDS, against the stored page.
// The gap between the two is a tile with no JPEG, which renders the live
// iframe. Nothing is broken during it.
//
// updateMany rather than update, so a page deleted between the save and the
// capture is a no-op rather than a P2025 — the same reason deletes use
// deleteMany.
export async function setPageThumbnail(
  slug: string,
  jpeg: Uint8Array,
): Promise<void> {
  await prisma.page.updateMany({
    where: { slug },
    // Buffer on the way in, matching how savePage and Passkey.publicKey write
    // bytes.
    data: { thumb: Buffer.from(jpeg), thumbAt: new Date() },
  });
}

// Re-exported so callers that only need the shelf row's shape do not import
// three modules to describe one thing.
export type ShelfPage = Awaited<ReturnType<typeof listPagesForGroup>>[number];
export type AdminPage = Awaited<ReturnType<typeof listPagesForAdmin>>[number];
export type { PageKind };
