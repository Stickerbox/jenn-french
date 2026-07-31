export type StudentTab = "card" | "files";

// `hasFiles` is the whole point of the second argument: an untokened visitor
// has no files tab, and a forwarded ?tab=files link must land them on the card
// rather than on a tab that should not exist for them.
export function parseStudentTab(
  value: string | undefined,
  hasFiles: boolean,
): StudentTab {
  return value === "files" && hasFiles ? "files" : "card";
}
