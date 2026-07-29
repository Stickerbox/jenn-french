// Returns the value only if it is a real, correctly shaped date. Date rolls
// overflow forward — "2026-02-31" parses to March 3rd rather than failing — so
// comparing the normalised output against the input rejects any value that
// silently shifted.
function validate(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;

  return value;
}

// The teaching week is Monday to Friday, so a weekend date is a day no student
// can ever be shown. The admin calendar has no weekend cell to click; this
// catches the ways round it — a hand-typed ?date=, an old bookmark, a link
// written while the week still ran to Saturday.
function snapWeekendForward(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return value;

  date.setUTCDate(date.getUTCDate() + (dayOfWeek === 0 ? 1 : 2));
  return date.toISOString().slice(0, 10);
}

// Deliberately does NOT clamp future dates the way the student page's
// parseDate does. Students must not read ahead; the teacher pre-posts ahead on
// purpose, and clamping would make those days unreachable from /admin. The
// weekend snap above is a different rule and applies to the `today` fallback
// too, so the returned date is never a Saturday or Sunday.
export function parseAdminDate(
  value: string | undefined,
  today: string,
): string {
  return snapWeekendForward(validate(value) ?? today);
}
