// One rule rather than a ternary in each page that mounts a StreamProvider.
//
// The teacher's endpoint lives at /api/inbox/stream and NOT /api/chat/stream on
// purpose: a static `stream` segment under app/api/chat/ would take routing
// precedence over app/api/chat/[slug]/, so a student whose name produced the
// slug "stream" would have their chat silently shadowed. Slugs come from
// teacher input via lib/student-slug.ts, so that is reachable.
export function streamUrl(input: {
  isTeacher: boolean;
  slug: string | null;
}): string {
  if (!input.isTeacher) {
    // Not a reachable state — a student's page always knows its own slug — but
    // an EventSource pointed at a 404 retries forever and silently, so this
    // fails loudly instead.
    if (!input.slug) throw new Error("a student stream needs a slug");
    return `/api/chat/${encodeURIComponent(input.slug)}/stream`;
  }

  // The board channel rides along so she holds ONE connection on a student's
  // page. On /admin there is no student page and so no board.
  return input.slug
    ? `/api/inbox/stream?board=${encodeURIComponent(input.slug)}`
    : "/api/inbox/stream";
}
