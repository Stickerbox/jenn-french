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

// THE HTML RULE. canSaveFromSlot above is THE PDF RULE, and they are both here
// on purpose: they agree about a student and disagree about Jenn, because the
// two page kinds now differ. A PDF version is an upload — a deliberate act she
// performs from wherever she is standing — so she may upload from all three of
// her tabs. An html version is auto-saved ten seconds after a keystroke, with
// no press in which to reconsider, so she is confined to one.
//
// Do not delete either as a duplicate of the other.
//
// A student: their own copy, always, and Jenn's correction, never — the same
// reason canSaveFromSlot gives, and it bites harder here. Under a pill they had
// to press something to destroy their attempt; under auto-save a stray
// keystroke on the correction would do it by itself.
//
// Jenn with no correction yet: any tab. Her typing seeds it — from the blank,
// which makes an answer key, or from the student's attempt, which makes an
// annotated attempt.
//
// Jenn with a correction: only her own tab. Without this she opens the
// student's attempt a second time, types, and ten seconds later her first
// correction is gone. There is no version history to recover it from. She gets
// back to a writable blank by DELETING her correction, which is a confirmed
// act — see the restart route.
export function isWritableSlot({
  slot,
  audience,
  hasTeacher,
}: {
  slot: VersionSlot;
  audience: VersionAudience;
  hasTeacher: boolean;
}): boolean {
  if (audience === "student") return slot === "student";
  return hasTeacher ? slot === "teacher" : true;
}
