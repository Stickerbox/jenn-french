import type { ReactNode } from "react";
import { getCurrentTeacher } from "@/lib/session";
import { listConversations } from "@/lib/inbox";
import { streamUrl } from "@/lib/stream-url";
import { StreamProvider } from "@/components/StreamProvider";
import { InboxFab } from "@/components/chat/InboxFab";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";
import { toBCP47 } from "@/lib/i18n";
import {
  loadConversation,
  markChatRead,
  deleteMessage,
  inviteLink,
} from "@/app/actions";

// Was a hardcoded English LABELS object, on the assumption Jenn's UI was
// always English. That split is retired (see CLAUDE.md's Auth / language
// note) — this now reads her own browser's Accept-Language, the same as every
// other server component on this page. Built from the dictionary inside the
// component below rather than at module scope, because it needs a request.

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

  const locale = await currentLocale();
  const strings = getStrings(locale);
  const chat = strings.admin.chat;

  const labels = {
    title: chat.title,
    close: strings.common.close,
    back: strings.chat.back,
    pickOne: chat.pickOne,
    empty: strings.chat.empty,
    placeholder: strings.chat.placeholder,
    send: strings.chat.send,
    locale: toBCP47(locale),
    today: strings.common.today,
    yesterday: chat.yesterday,
    deleteMessage: strings.chat.deleteMessage,
    reply: strings.chat.reply,
    cancelReply: strings.chat.cancelReply,
    search: chat.search,
    clear: strings.common.clear,
    noStudents: chat.noStudents,
    noMatch: chat.noMatch,
    noMessages: chat.noMessages,
    you: chat.you,
    unread: chat.unread,
    notSignedUp: chat.notSignedUp,
    // UnclaimedNotice.tsx (a chat component this task does not own — see
    // CLAUDE.md) substitutes the real student name into this string itself,
    // with .replace("{name}", name), because one LABELS object is built once
    // here for every student in the list, before any one of them is
    // selected. Calling the dictionary's function with the literal token
    // "{name}" is what keeps notSignedUpLong a FUNCTION in lib/strings.ts,
    // per this project's interpolation rule, while still producing the
    // template that call site needs — the function only ever places its
    // argument verbatim, so handing it the token back out is exact.
    notSignedUpLong: chat.notSignedUpLong("{name}"),
    copyInvite: chat.copyInvite,
    copied: chat.copied,
  };

  return (
    <StreamProvider url={streamUrl({ isTeacher: true, slug: studentSlug })}>
      {children}
      <InboxFab
        conversations={conversations}
        initialSelectedId={selected}
        labels={labels}
        onLoadConversation={loadConversation}
        onMarkRead={markChatRead}
        onDeleteMessage={deleteMessage}
        onInviteLink={inviteLink}
      />
    </StreamProvider>
  );
}
