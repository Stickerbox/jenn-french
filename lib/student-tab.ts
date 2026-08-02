export type StudentTab = "card" | "files" | "board";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and a third would make it likely.
//
// Availability is the whole point of the second argument. An untokened visitor
// has neither of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
//
// `card` joins them because the teacher does not get one: she opens a student
// from the admin to see their shelf and their board, and the daily card there
// is the same global card she just finished editing.
export function parseStudentTab(
  value: string | undefined,
  available: { card: boolean; files: boolean; board: boolean },
): StudentTab {
  if (value === "card" && available.card) return "card";
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";

  if (available.card) return "card";
  if (available.files) return "files";
  if (available.board) return "board";

  // Unreachable: the card is only ever withheld from a teacher, who is unlocked
  // and therefore has both other tabs. A total function still needs an answer,
  // and the card branch degrades to "nothing posted yet" rather than to a crash.
  return "card";
}
