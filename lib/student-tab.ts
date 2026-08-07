export type StudentTab = "card" | "files" | "board" | "cards" | "todo";

// A record rather than positional booleans: two flags called with the wrong
// order is a silent bug, and five would make it certain.
//
// Availability is the whole point of the second argument. An untokened visitor
// has none of the extra tabs, and a forwarded ?tab= link must land them on
// the card rather than on a tab that should not exist for them.
//
// `card` joins them because the teacher does not get one: she opens a student
// from the admin to see their shelf and their board, and the daily card there
// is the same global card she just finished editing.
export function parseStudentTab(
  value: string | undefined,
  available: {
    card: boolean;
    files: boolean;
    board: boolean;
    cards: boolean;
    todo: boolean;
  },
): StudentTab {
  if (value === "card" && available.card) return "card";
  if (value === "files" && available.files) return "files";
  if (value === "board" && available.board) return "board";
  if (value === "cards" && available.cards) return "cards";
  if (value === "todo" && available.todo) return "todo";

  // The fallback order, and it is not the same as the strip's order by
  // accident: files comes before the deck because an unlocked teacher has no
  // card tab, and the shelf is what she opens a student to see.
  if (available.card) return "card";
  if (available.files) return "files";
  if (available.board) return "board";
  if (available.cards) return "cards";
  if (available.todo) return "todo";

  // Unreachable: the card is only ever withheld from a teacher, who is unlocked
  // and therefore has every other tab. A total function still needs an answer,
  // and the card branch degrades to "nothing posted yet" rather than to a crash.
  return "card";
}
