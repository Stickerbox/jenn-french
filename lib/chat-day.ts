export type DayGroup<T> = { day: string; messages: T[] };

// The spec chose a continuous log with day separators over a session model, so
// this is what "a lesson" means here — whatever happened on one calendar day.
//
// UTC, like every other date in this project. A message sent at 20:00 in
// Montreal lands under the following day's heading; that is the cost of the
// project-wide rule, not an oversight.
export function groupByDay<T extends { createdAt: Date }>(
  messages: T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];

  for (const message of messages) {
    const day = message.createdAt.toISOString().slice(0, 10);
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
