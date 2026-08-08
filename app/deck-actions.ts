"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { chatRole, type ChatRole } from "@/lib/chat-access";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { currentStrings } from "@/lib/locale";
import {
  MAX_CARD_FACE,
  MAX_CARD_NOTE,
  MAX_ITEM_TEXT,
} from "@/lib/deck-limits";

// chatRole and NOT shelfRole, and the difference is the everyone group.
// shelfRole answers "teacher" before it tests isEveryone, deliberately, because
// the shared shelf is Jenn's to fill. Neither of these features has a shared
// version: a deck is one student's vocabulary and a checklist is between two
// people, so the everyone group must be refused for BOTH parties — which is
// chatRole's first clause, and the same reuse the whiteboard makes.
//
// The token is read from the cookie here and never taken as an argument, so a
// client cannot assert one. requireShelfRole in app/page-actions.ts is the
// shape this follows.
async function requireDeckRole(groupId: string): Promise<ChatRole> {
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
  const role = chatRole({
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

// One path, revalidated by both features. A pattern rather than a slug: a card
// and an item both live under /g/[slug], and the tab is a search param rather
// than a segment.
function revalidateDeck() {
  revalidatePath("/g/[slug]", "page");
}

function requireText(value: string, max: number): string {
  const text = value.trim();
  // Bounded on the way in as well as by the column, because a client is not an
  // authority on length. An empty card or an empty checklist row is a row
  // nobody can read or press.
  //
  // REJECTS rather than truncating, which is what every other bounded input
  // here does — validatePageHtml returns an error over MAX_PAGE_BYTES and
  // parseMessageBody returns null, which the chat route turns into a 400.
  // Truncating would save a teacher's 250-character card as 200 characters
  // with no signal at all: the action resolves, the sheet closes, and the
  // last fifty characters are simply gone.
  //
  // The message is internal and written for a stack trace. Both forms discard
  // it and show their own dictionary sentence, the rule ShelfFab's catches
  // already follow — and both cap their inputs with the same constant, so
  // reaching this needs the attribute removed by hand.
  if (!text) throw new Error("Empty");
  if (text.length > max) throw new Error("Too long");
  return text;
}

export async function addFlashcard(
  groupId: string,
  input: { front: string; back: string; note: string },
): Promise<void> {
  const role = await requireDeckRole(groupId);

  await prisma.flashcard.create({
    data: {
      groupId,
      front: requireText(input.front, MAX_CARD_FACE),
      back: requireText(input.back, MAX_CARD_FACE),
      // An empty note is null, not "". The column is nullable so the viewer can
      // ask one question — is there a note — rather than two.
      note: input.note.trim() ? requireText(input.note, MAX_CARD_NOTE) : null,
      // From the ROLE the guard resolved, never from an argument — the same
      // rule addActionItem below states, and for the same reason: a client that
      // could name its own author could put words in Jenn's mouth on a deck she
      // shares with a student.
      fromTeacher: role === "teacher",
    },
  });

  revalidateDeck();
}

export async function deleteFlashcard(
  groupId: string,
  id: string,
): Promise<void> {
  await requireDeckRole(groupId);
  // deleteMany, and scoped by groupId as well as id: a double-click or a stale
  // tab is a no-op rather than a P2025, and a card id guessed from one
  // student's deck cannot be deleted through another's.
  await prisma.flashcard.deleteMany({ where: { id, groupId } });
  revalidateDeck();
}

// THE WRITE ON READ. The only one in this codebase — every other write here is
// a deliberate act, a save or a send or a pin.
//
// Two things about it are load-bearing. It is refused for the teacher, because
// a card sits on one student's deck but two people can open it: if Jenn's
// browsing stamped this, flicking through Marie's deck would tell Marie's app
// that Marie revised everything, and the cards she is struggling with would
// drop to the bottom of the list that exists to surface them.
//
// It returns SILENTLY for the teacher rather than throwing, which bends this
// codebase's own rule that silence is for a resource already gone and a policy
// refusal throws (see setShelfPin). The bend is deliberate: unlike deleteGroup
// or setShelfPin, nobody pressed anything here — it is fired unawaited on every
// card opened, so a throw would be an uncaught rejection in the browser for
// every card Jenn looks at, with nothing to catch it and nothing to show.
//
// And it does NOT revalidate. The caller fires it without awaiting, and a
// revalidation would re-render the deck underneath a reader who is mid-flip and
// reorder it under them when the sort is "À réviser". The new timestamp is
// picked up on the next navigation, which is when it matters.
export async function markFlashcardViewed(
  groupId: string,
  id: string,
): Promise<void> {
  const role = await requireDeckRole(groupId);
  if (role !== "student") return;

  await prisma.flashcard.updateMany({
    where: { id, groupId },
    data: { lastViewedAt: new Date() },
  });
}

export async function addActionItem(
  groupId: string,
  text: string,
): Promise<void> {
  const role = await requireDeckRole(groupId);

  await prisma.actionItem.create({
    data: {
      groupId,
      text: requireText(text, MAX_ITEM_TEXT),
      // From the ROLE the guard resolved, never from an argument. A client that
      // could name its own author could put words in Jenn's mouth on a list she
      // shares with a student.
      fromTeacher: role === "teacher",
    },
  });

  revalidateDeck();
}

export async function setActionItemDone(
  groupId: string,
  id: string,
  done: boolean,
): Promise<void> {
  const role = await requireDeckRole(groupId);
  await prisma.actionItem.updateMany({
    where: { id, groupId },
    data: {
      doneAt: done ? new Date() : null,
      // Cleared alongside doneAt, so an untick leaves no author behind for the
      // next tick to inherit. doneAt already answers WHEN; this answers who,
      // which doneAt cannot, because either party may tick a shared list.
      doneByTeacher: done ? role === "teacher" : null,
    },
  });
  revalidateDeck();
}

export async function deleteActionItem(
  groupId: string,
  id: string,
): Promise<void> {
  await requireDeckRole(groupId);
  await prisma.actionItem.deleteMany({ where: { id, groupId } });
  revalidateDeck();
}
