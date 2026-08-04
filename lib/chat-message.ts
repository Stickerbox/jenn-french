// Mirrors StoredMessage in lib/messages.ts, minus nothing: the SSE route
// JSON.stringifies the whole selected record, so groupId has always been on the
// wire. It was dropped here only because a per-slug stream had no use for it.
// The inbox does — one array holds every conversation and this is what sorts
// them apart.
export type ChatMessage = {
  id: string;
  groupId: string;
  fromTeacher: boolean;
  body: string;
  createdAt: Date;
};
