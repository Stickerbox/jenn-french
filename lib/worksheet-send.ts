// Send is a notice and nothing else. Every save has already happened by the
// time it is pressed; all this decides is whether there is anything worth
// telling the other party about.
//
// "empty"  — nothing saved and nothing typed. Drawn, disabled, so the control
//            is where it will be rather than appearing from nowhere.
// "ready"  — unannounced work exists.
// "sent"   — announced, and unchanged since. Drawn, disabled, and it SAYS so:
//            a control that vanishes after a press tells the student nothing
//            about whether the press worked.
export type SendState = "empty" | "ready" | "sent";

// `dirty` FIRST, and this order is the rule. Unsaved typing outranks both
// other facts: `sentAt` describes the row on the server, which the last ten
// seconds of typing have not reached yet. Press it and the button flushes that
// write before it announces anything — a notice about work that was never
// stored is worse than a late notice.
export function sendState({
  hasOwnVersion,
  sent,
  dirty,
}: {
  hasOwnVersion: boolean;
  // The caller's own row has been announced. Reduced from PageVersion.sentAt
  // by whoever loads it, because nothing here needs to know when.
  sent: boolean;
  dirty: boolean;
}): SendState {
  if (dirty) return "ready";
  if (!hasOwnVersion) return "empty";
  return sent ? "sent" : "ready";
}
