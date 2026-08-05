import type { PageKind } from "@/lib/page-kind";

// The guards that sit ON TOP of chatRole, never instead of it. chatRole decides
// who may be here at all — and because it refuses the everyone group before it
// checks the teacher, /g/all needs no clause below. These four are about the
// page rather than the person.
//
// `onShelf` is computed by a query and passed in, so the rule stays pure and
// the query stays in the route that owns it.
export function worksheetOpenable(input: {
  role: "teacher" | "student" | null;
  worksheet: boolean;
  kind: PageKind;
  onShelf: boolean;
}): boolean {
  if (!input.role) return false;
  if (!input.worksheet) return false;
  // A link is not hosted here and has nothing to fill in.
  if (input.kind === "link") return false;
  // Without this a guessable page slug would let anyone attach versions to any
  // document in the database.
  return input.onShelf;
}
