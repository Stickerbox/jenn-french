// Mirrors StoredMessage in lib/messages.ts, minus nothing: the SSE route
// JSON.stringifies the whole selected record, so groupId has always been on the
// wire. It was dropped here only because a per-slug stream had no use for it.
// The inbox does — one array holds every conversation and this is what sorts
// them apart.
//
// automated, href, replyToId and replyTo were added alongside StoredMessage's —
// same reason, same requirement to stay in step: whatever the SELECT in
// lib/messages.ts carries is exactly what a client-side listener receives.
export type ChatMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  automated: boolean;
  href: string | null;
  replyToId: string | null;
  replyTo: { id: string; body: string; fromTeacher: boolean } | null;
  createdAt: Date;
};
