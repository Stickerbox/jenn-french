import { prisma } from "@/lib/prisma";
import {
  foldPage,
  normaliseOps,
  readOps,
  type Op,
  type Scene,
} from "@/lib/whiteboard-ops";

// What the archive grid needs, and nothing more — deliberately without ops, so
// opening the tab does not ship every board's log to the browser.
export type WhiteboardSummary = {
  id: string;
  date: Date;
  createdAt: Date;
  thumbnail: string;
  pageCount: number;
};

export async function listWhiteboards(
  groupId: string,
): Promise<WhiteboardSummary[]> {
  const rows = await prisma.whiteboard.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      date: true,
      createdAt: true,
      thumbnail: true,
      _count: { select: { pages: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    createdAt: row.createdAt,
    thumbnail: row.thumbnail,
    pageCount: row._count.pages,
  }));
}

// Scoped by groupId as well as id so a board id guessed from one student's page
// cannot be read through another's.
export async function getWhiteboardScene(
  groupId: string,
  id: string,
): Promise<Scene | null> {
  const board = await prisma.whiteboard.findFirst({
    where: { id, groupId },
    select: { pages: { orderBy: { index: "asc" }, select: { ops: true } } },
  });
  if (!board) return null;

  // readOps, not a cast: a Json column has been checked by nothing until now.
  // foldPage, not a filter: a stored page's log still holds its own removes, so
  // dropping them without APPLYING them would make erased strokes reappear in
  // the export — the one bug in this module that would look like data loss in
  // reverse.
  return board.pages.map((page) => foldPage(readOps(page.ops)));
}

export async function createWhiteboard(input: {
  groupId: string;
  date: Date;
  thumbnail: string;
  pages: Op[][];
}): Promise<string> {
  // A nested create is a single statement group, so a board never lands with
  // some of its pages missing.
  const board = await prisma.whiteboard.create({
    data: {
      groupId: input.groupId,
      date: input.date,
      thumbnail: input.thumbnail,
      pages: {
        create: input.pages.map((ops, index) => ({
          index,
          ops: normaliseOps(ops),
        })),
      },
    },
    select: { id: true },
  });

  return board.id;
}

export async function deleteWhiteboardRow(
  groupId: string,
  id: string,
): Promise<void> {
  // deleteMany so a double-click or a stale tab is a no-op rather than a P2025.
  await prisma.whiteboard.deleteMany({ where: { id, groupId } });
}
