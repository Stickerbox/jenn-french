import { prisma } from "@/lib/prisma";

export type ActionItemRow = {
  id: string;
  text: string;
  fromTeacher: boolean;
  doneAt: Date | null;
  createdAt: Date;
};

export async function listActionItems(
  groupId: string,
): Promise<ActionItemRow[]> {
  return prisma.actionItem.findMany({
    where: { groupId },
    // Creation order, oldest first, and done rows are NOT moved to the bottom.
    // A row that jumps the instant it is ticked makes an accidental tick hard
    // to undo, because the row you meant to press is no longer where you
    // pressed. It is struck through in place instead.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      text: true,
      fromTeacher: true,
      doneAt: true,
      createdAt: true,
    },
  });
}
