export type StudentTab = "card" | "files" | "board";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and a third would make it likely.
//
// Availability is the whole point of the second argument. An untokened visitor
// has neither of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
export function parseStudentTab(
  value: string | undefined,
  available: { files: boolean; board: boolean },
): StudentTab {
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";
  return "card";
}
