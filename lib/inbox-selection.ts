// Which conversation the inbox opens on, and (below md) whether that is the
// list or the conversation itself. See the 2026-08-05 note in InboxFab.tsx for
// why the read/write around this lives in the component rather than here:
// this file stays pure so the five-branch rule has a test that needs no DOM.

export type InboxView = "list" | "conversation";
export type StoredSelection = { groupId: string | null; view: InboxView };

export function resolveInboxSelection(input: {
  // initialSelectedId — she is standing on a student's page. Checked first and
  // wins over anything remembered: see the comment on that prop in
  // InboxFab.tsx, which this preserves rather than replaces.
  pinned: string | null;
  stored: StoredSelection | null;
  // Conversation ids in the order the list shows them (orderConversations'
  // output), so "the first conversation" means what she sees at the top, not
  // whatever order the server happened to send.
  ordered: string[];
  // True at md and up, where ChatPanel shows both panes and an unselected
  // inbox would otherwise render nothing in the right one.
  wide: boolean;
}): { selectedId: string | null; view: InboxView } {
  const { pinned, stored, ordered, wide } = input;

  if (pinned && ordered.includes(pinned)) {
    return { selectedId: pinned, view: "conversation" };
  }

  // A dangling stored id (that student was deleted since she last closed the
  // panel) must not be handed back as a selection — ConversationList and
  // ChatPanel would both be rendering a conversation that no longer exists.
  // Falling through to the defaults below is deliberate, not an oversight.
  if (stored && stored.groupId && ordered.includes(stored.groupId)) {
    return { selectedId: stored.groupId, view: stored.view };
  }

  if (wide) {
    // Desktop always resolves to a conversation pane, even with nothing
    // remembered — ChatPanel's right side has nowhere else to put "pick one"
    // that reads better than just showing the first thread.
    return { selectedId: ordered[0] ?? null, view: "conversation" };
  }

  // Below md, the unopinionated default is the list — see the mobile branch
  // in the design note this implements.
  return { selectedId: null, view: "list" };
}

// Defensive by the same contract as readSections and readOps: a Json column
// there, a string here, but the same rule — anything that is not exactly the
// shape expected degrades to "nothing remembered" rather than throwing, since
// a hand-edited or previous-format localStorage value must not break the
// panel on open.
export function parseStoredSelection(raw: string | null): StoredSelection | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { groupId, view } = parsed as Record<string, unknown>;
  if (groupId !== null && typeof groupId !== "string") return null;
  if (view !== "list" && view !== "conversation") return null;
  return { groupId, view };
}
