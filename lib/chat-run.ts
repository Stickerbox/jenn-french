import type { ChatMessage } from "@/lib/chat-message";

// A run is what a messenger actually groups on screen: not a day (groupByDay's
// job) but a burst from one party. Five minutes of silence reads as "they
// stepped away and came back", so it starts a fresh run — and a fresh
// timestamp — even from the same sender.
export const RUN_GAP_MS = 5 * 60 * 1000;

export type MessageRun = { fromTeacher: boolean; messages: ChatMessage[] };

// Runs inside a single day group; groupByDay still owns the date separators
// and this never sees messages from two different days conflated into one
// run, because callers apply it per day.
export function groupIntoRuns(messages: ChatMessage[]): MessageRun[] {
  const runs: MessageRun[] = [];

  for (const message of messages) {
    const current = runs[runs.length - 1];
    const last = current?.messages[current.messages.length - 1];

    // Measured against the immediately preceding message, not the run's first
    // one: a long back-and-forth burst from one sender should not fracture
    // just because it has been going on for a while, only because two
    // adjacent messages are far apart in time.
    const gap = last
      ? message.createdAt.getTime() - last.createdAt.getTime()
      : Infinity;

    if (
      current &&
      current.fromTeacher === message.fromTeacher &&
      gap <= RUN_GAP_MS
    ) {
      current.messages.push(message);
    } else {
      runs.push({ fromTeacher: message.fromTeacher, messages: [message] });
    }
  }

  return runs;
}
