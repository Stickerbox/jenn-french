import { localDayKey } from "@/lib/chat-time";

export type DayGroup<T> = { day: string; messages: T[] };

// The spec chose a continuous log with day separators over a session model, so
// this is what "a lesson" means here — whatever happened on one calendar day.
//
// That day is the READER's, not UTC. Every other date in this project is UTC
// and stays UTC; this one moved on 2026-08-04, when a clock time was printed
// under each message and a 20:00 Montreal message sitting under tomorrow's
// heading stopped being a consistent rule and started being a bug.
//
// The consequence to hold onto: a message's heading now depends on who is
// reading it, and Jenn in Montreal and a student in Vancouver can correctly see
// the same message under different dates. Nothing is stored differently.
//
// `timeZone` is for tests only — see lib/chat-time.ts.
export function groupByDay<T extends { createdAt: Date }>(
  messages: T[],
  timeZone?: string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const message of messages) {
    const day = localDayKey(message.createdAt, timeZone);
    const current = groups[groups.length - 1];

    // Compared against the last group rather than looked up in a map: the
    // caller hands these over already ordered, so a day that reappears later
    // would mean the ordering broke, and silently merging it would hide that.
    if (current && current.day === day) {
      current.messages.push(message);
    } else {
      groups.push({ day, messages: [message] });
    }
  }

  return groups;
}
