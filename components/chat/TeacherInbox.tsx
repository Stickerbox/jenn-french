import type { ReactNode } from "react";
import { getCurrentTeacher } from "@/lib/session";
import { listConversations } from "@/lib/inbox";
import { streamUrl } from "@/lib/stream-url";
import { StreamProvider } from "@/components/StreamProvider";
import { InboxFab } from "@/components/chat/InboxFab";
import {
  loadConversation,
  markChatRead,
  deleteMessage,
  inviteLink,
} from "@/app/actions";

// English throughout, matching the rest of the admin. On /g/marie that means a
// French page with an English FAB, which is correct: the page is the student's
// and the FAB is hers. Every string is a prop rather than inline copy so the
// planned localisation is a map swap — see lib/page-section-labels.ts for the
// pattern this follows.
const LABELS = {
  title: "Messages",
  close: "Close",
  back: "Back",
  pickOne: "Pick a student to see your conversation.",
  empty: "No messages yet.",
  placeholder: "Write a message…",
  send: "Send",
  locale: "en-CA",
  today: "Today",
  yesterday: "Yesterday",
  deleteMessage: "Delete",
  search: "Search students",
  noStudents: "No students yet.",
  noMatch: "Nothing matches that.",
  noMessages: "No messages yet",
  you: "You: ",
  unread: "Unread messages",
  // Claim state (2026-08-03 student sign-in). Copy about a student stays
  // gender-neutral, as that spec requires: Jenn's students are not all of one
  // gender and the schema records a name, not a pronoun.
  notSignedUp: "Hasn't signed up yet",
  notSignedUpLong:
    "{name} hasn't signed up yet, so there's nobody to receive a message. Share their invite link.",
  copyInvite: "Copy invite",
  copied: "Copied",
};

// Owns the StreamProvider rather than sitting inside one, because on a student
// page the provider has to wrap the page body as well — LiveBanner and BoardTab
// call useStream. Two providers would mean two EventSources, which is precisely
// what StreamProvider exists to prevent.
export async function TeacherInbox({
  studentSlug = null,
  children,
}: {
  // The student whose page this is, when there is one. It does two jobs: it is
  // the board channel folded into her single stream, and it is the conversation
  // the inbox opens on.
  studentSlug?: string | null;
  children?: ReactNode;
}) {
  const teacher = await getCurrentTeacher();
  // Not a redirect and not a throw: this renders on pages that legitimately
  // have non-teacher visitors, and its job there is to be invisible.
  if (!teacher) return <>{children}</>;

  const conversations = await listConversations();
  const selected =
    conversations.find((c) => c.slug === studentSlug)?.groupId ?? null;

  return (
    <StreamProvider url={streamUrl({ isTeacher: true, slug: studentSlug })}>
      {children}
      <InboxFab
        conversations={conversations}
        initialSelectedId={selected}
        labels={LABELS}
        onLoadConversation={loadConversation}
        onMarkRead={markChatRead}
        onDeleteMessage={deleteMessage}
        onInviteLink={inviteLink}
      />
    </StreamProvider>
  );
}
