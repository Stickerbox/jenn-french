import { prisma } from "@/lib/prisma";

// What the deck needs, and nothing more. `note` rides along because the viewer
// shows it on the back and a deck is a handful of short rows — unlike a shelf,
// there is no large column here worth a second query to avoid.
export type FlashcardRow = {
  id: string;
  front: string;
  back: string;
  note: string | null;
  lastViewedAt: Date | null;
  createdAt: Date;
  // Who added it. What lets a dot mean "the other party added this" rather
  // than "something is here": your own card must never light your own tab.
  fromTeacher: boolean;
};

export async function listFlashcards(groupId: string): Promise<FlashcardRow[]> {
  return prisma.flashcard.findMany({
    where: { groupId },
    // createdAt desc is the "Ajout" default. The other two orders are applied
    // in the browser by orderFlashcards, because Random needs a seed that only
    // the client has and Revision has to re-sort the moment a card is opened.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      front: true,
      back: true,
      note: true,
      lastViewedAt: true,
      createdAt: true,
      fromTeacher: true,
    },
  });
}
