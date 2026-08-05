// The blank is not a row: it is Page.html or Page.pdf. The other two are the
// two PageVersion slots, which is why this type has three members and
// PageVersion has one boolean.
export type VersionSlot = "blank" | "student" | "teacher";
export type VersionAudience = "student" | "teacher";

export function slotForVersion(fromTeacher: boolean): VersionSlot {
  return fromTeacher ? "teacher" : "student";
}

// Chosen by audience, the way greeting and teacherPageLabel already split:
// French for the student, English for Jenn, from one table rather than two
// copies that would drift.
export function versionLabel(
  slot: VersionSlot,
  audience: VersionAudience,
  studentName: string,
): string {
  if (audience === "student") {
    if (slot === "blank") return "Le devoir";
    if (slot === "student") return "Mes réponses";
    return "La correction de Jenn";
  }

  if (slot === "blank") return "The worksheet";
  // The WHOLE name, and always 's — the rule teacherPageLabel records. Two
  // students can share a first name, and "Jonas' answers" would be a second
  // possessive rule for one apostrophe's worth of grammar.
  if (slot === "student") return `${studentName}'s answers`;
  return "My correction";
}
