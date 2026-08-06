import type { VersionSlot, VersionAudience } from "@/lib/version-labels";

// Which versions each party may save FROM. Not an access rule — the route has
// always written the caller's own slot from whatever view called it, and still
// does, because there is nothing in the request that says which slot. This
// decides where the shell draws the control.
//
// Jenn: all three. She corrects from the blank, from the student's attempt, or
// from her own earlier correction, and every one of those writes her own slot.
//
// A student: the blank and their own answers, never Jenn's correction. Typing
// over a correction and pressing save would write the student's slot with the
// teacher's marks in it — the attempt would then contain the answers, and the
// record of what they actually handed in would be gone. The two parties are
// not symmetric here because their slots are not: Jenn writing from the
// student's attempt is how a correction is made, and a student writing from
// Jenn's correction is how an attempt is destroyed.
export function canSaveFromSlot(
  slot: VersionSlot,
  audience: VersionAudience,
): boolean {
  if (audience === "teacher") return true;
  return slot !== "teacher";
}
