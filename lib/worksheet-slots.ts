import type { VersionSlot, VersionAudience } from "@/lib/version-labels";

// Which version tabs each party is shown. The student's maximum is two and
// Jenn's is three, and that asymmetry is the point: comparing two copies of
// one worksheet is HER job, not theirs. To a student the document is their
// homework, not a version of anything.
//
// A student is never shown the blank. Their first view is the blank's content
// served under their own slot — the seed, which app/g/[slug]/w/[pageSlug]/raw
// supplies when they have no row yet. Giving it a tab of its own asked them to
// choose between their homework and an older copy of their homework.
//
// The blank is not a row, which is why it is added here rather than derived
// from what exists: it is Page.html, and it is always there.
export function visibleSlots({
  audience,
  hasStudent,
  hasTeacher,
}: {
  audience: VersionAudience;
  hasStudent: boolean;
  hasTeacher: boolean;
}): VersionSlot[] {
  if (audience === "student") {
    return hasTeacher ? ["student", "teacher"] : ["student"];
  }

  const slots: VersionSlot[] = ["blank"];
  if (hasStudent) slots.push("student");
  if (hasTeacher) slots.push("teacher");
  return slots;
}
