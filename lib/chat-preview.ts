export type PreviewSource = { body: string; fromTeacher: boolean } | null;
export type PreviewLabels = { you: string; empty: string };

// Labels rather than inline copy, like lib/page-section-labels.ts: the admin
// says "You: " and a future French admin says "Vous : ", and the separator has
// to travel with the word because French puts a space before a colon.
export function previewText(
  last: PreviewSource,
  labels: PreviewLabels,
): string {
  if (!last) return labels.empty;

  // Collapsed, not truncated. The row is one line clamped by CSS; the job here
  // is making sure that line is not blank because the message happened to start
  // with a newline. The body arrives already capped at 200 characters by
  // lib/inbox.ts, which is a payload concern rather than a display one.
  const flat = last.body.replace(/\s+/g, " ").trim();
  if (flat === "") return labels.empty;

  return last.fromTeacher ? `${labels.you}${flat}` : flat;
}
