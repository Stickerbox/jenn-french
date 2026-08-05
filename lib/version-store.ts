import { prisma } from "@/lib/prisma";
import { packSnapshot, unpackSnapshot } from "@/lib/snapshot-codec";
import { readVersionKind, type VersionKind } from "@/lib/page-version-kind";
import type { ShelfVersion } from "@/lib/page-versions";

export type StoredVersion = {
  fromTeacher: boolean;
  kind: VersionKind;
  updatedAt: Date;
};

// Neither blob is ever selected here, for the reason SHELF_SELECT omits `html`
// and `pdf`: one holds a whole document and the other a whole file, and loading
// either to list what exists ships the thing the list was avoiding.
const SUMMARY = {
  fromTeacher: true,
  kind: true,
  pdfSize: true,
  updatedAt: true,
} as const;

export async function listVersions(
  pageId: string,
  groupId: string,
): Promise<StoredVersion[]> {
  const rows = await prisma.pageVersion.findMany({
    where: { pageId, groupId },
    select: SUMMARY,
  });

  return rows.map((row) => ({
    fromTeacher: row.fromTeacher,
    kind: readVersionKind(row),
    updatedAt: row.updatedAt,
  }));
}

// One shelf's versions across every page on it, for applyVersions. One query
// beside the pins query, not one per tile.
export async function listShelfVersions(groupId: string): Promise<ShelfVersion[]> {
  return prisma.pageVersion.findMany({
    where: { groupId },
    select: { pageId: true, fromTeacher: true, updatedAt: true },
  });
}

export async function getVersionHtml(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<string | null> {
  const row = await prisma.pageVersion.findUnique({
    where: { pageId_groupId_fromTeacher: { pageId, groupId, fromTeacher } },
    select: { snapshot: true },
  });
  if (!row?.snapshot) return null;
  return unpackSnapshot(new Uint8Array(row.snapshot));
}

// Its own query, and the only one that selects `pdf` — same reasoning as
// getPagePdf's: a caller reaching for a list must not be able to pull 3 MB per
// row by forgetting which helper it called.
export async function getVersionPdf(
  pageId: string,
  groupId: string,
  fromTeacher: boolean,
): Promise<Uint8Array | null> {
  const row = await prisma.pageVersion.findUnique({
    where: { pageId_groupId_fromTeacher: { pageId, groupId, fromTeacher } },
    select: { pdf: true },
  });
  if (!row?.pdf) return null;
  return new Uint8Array(row.pdf);
}

// Every content column on every write, all but one to null — savePage's flat
// invariant, and it matters here for the same reason: a kind changed at the
// same slug must never leave the other kind's bytes behind for readVersionKind
// to choose between.
export async function saveHtmlVersion(input: {
  pageId: string;
  groupId: string;
  fromTeacher: boolean;
  html: string;
}): Promise<void> {
  const snapshot = Buffer.from(await packSnapshot(input.html));
  const columns = { kind: "html", snapshot, pdf: null, pdfSize: null };

  await prisma.pageVersion.upsert({
    where: {
      pageId_groupId_fromTeacher: {
        pageId: input.pageId,
        groupId: input.groupId,
        fromTeacher: input.fromTeacher,
      },
    },
    create: {
      pageId: input.pageId,
      groupId: input.groupId,
      fromTeacher: input.fromTeacher,
      ...columns,
    },
    update: columns,
  });
}

export async function savePdfVersion(input: {
  pageId: string;
  groupId: string;
  fromTeacher: boolean;
  pdf: Uint8Array;
}): Promise<void> {
  const columns = {
    kind: "pdf",
    snapshot: null,
    // Buffer on the way in, matching how savePage and Passkey.publicKey write
    // bytes.
    pdf: Buffer.from(input.pdf),
    pdfSize: input.pdf.byteLength,
  };

  await prisma.pageVersion.upsert({
    where: {
      pageId_groupId_fromTeacher: {
        pageId: input.pageId,
        groupId: input.groupId,
        fromTeacher: input.fromTeacher,
      },
    },
    create: {
      pageId: input.pageId,
      groupId: input.groupId,
      fromTeacher: input.fromTeacher,
      ...columns,
    },
    update: columns,
  });
}
