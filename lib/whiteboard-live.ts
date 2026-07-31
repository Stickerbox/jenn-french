import type { DrawOp, Op } from "@/lib/whiteboard-ops";

export type LiveBoard = {
  // Stamped when she opened it, so a lesson crossing UTC midnight belongs to
  // the day it started rather than the day it ended.
  date: Date;
  ops: Op[];
  // Which page she is presenting. Presentation state, not board content — a
  // saved board has no current page, and the reader opens whichever they like.
  currentPage: number;
  // The stroke currently under her cursor, held in its own slot rather than
  // appended to the log. That is what lets a long line GROW on the student's
  // screen without any id trickery: each flush replaces this, and the committed
  // stroke clears it. Never stored — /finish reads the client's log, not this.
  pending: DrawOp | null;
};

// Held on globalThis for the same reason lib/prisma.ts and lib/chat-bus.ts are:
// dev's module reloading would otherwise hand each reload a fresh map, and a
// board opened before the reload would vanish mid-lesson.
const globalForLive = globalThis as unknown as {
  liveBoards: Map<string, LiveBoard> | undefined;
};

const boards = globalForLive.liveBoards ?? new Map<string, LiveBoard>();

if (process.env.NODE_ENV !== "production") {
  globalForLive.liveBoards = boards;
}

// A lesson-length board is a few thousand ops. This is a memory bound, not a
// product limit, and it is enforced here rather than trusted to the client.
const MAX_LIVE_OPS = 20_000;

export const liveBoards = {
  get(groupId: string): LiveBoard | null {
    return boards.get(groupId) ?? null;
  },

  // False rather than throwing when one is already open: the route turns that
  // into a 409 with a message she can read, and one student cannot be watching
  // two boards at once.
  open(groupId: string, date: Date): boolean {
    if (boards.has(groupId)) return false;
    boards.set(groupId, { date, ops: [], currentPage: 0, pending: null });
    return true;
  },

  append(
    groupId: string,
    ops: Op[],
    currentPage: number,
    pending: DrawOp | null,
  ): boolean {
    const board = boards.get(groupId);
    if (!board) return false;
    // The ceiling counts the log only. `pending` is one op that is replaced
    // rather than accumulated, so it cannot grow without bound.
    if (board.ops.length + ops.length > MAX_LIVE_OPS) return false;

    board.ops.push(...ops);
    board.currentPage = currentPage;
    // A committed op supersedes whatever was in flight: the stroke she just
    // finished IS the pending one, now in the log.
    board.pending = ops.length > 0 ? null : pending;
    return true;
  },

  // Tolerant of a group with no board: /finish and /discard both call it, and
  // so does a restart-crossed retry.
  discard(groupId: string): void {
    boards.delete(groupId);
  },
};
