// Deliberately does NOT clamp future dates the way the student page's
// parseDate does. Students must not read ahead; the teacher pre-posts ahead
// on purpose, and clamping would make those days unreachable from /admin.
export function parseAdminDate(
  value: string | undefined,
  today: string,
): string {
  if (!value) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return today;

  // Date rolls overflow forward: "2026-02-31" parses to March 3rd rather than
  // failing. Comparing the normalised output against the input rejects any
  // value that silently shifted.
  if (parsed.toISOString().slice(0, 10) !== value) return today;

  return value;
}
