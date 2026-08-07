import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

// The blank is not a row: it is Page.html or Page.pdf. The other two are the
// two PageVersion slots, which is why this type has three members and
// PageVersion has one boolean.
export type VersionSlot = "blank" | "student" | "teacher";
export type VersionAudience = "student" | "teacher";

export function slotForVersion(fromTeacher: boolean): VersionSlot {
  return fromTeacher ? "teacher" : "student";
}

// TWO AXES, AND THEY ARE NOT THE SAME QUESTION. `audience` is PERSPECTIVE —
// whose answers this row holds, relative to whoever is reading — and `locale`
// is the language to say it in.
//
// This used to pick both from `audience` alone: French for the student,
// English for Jenn. That was the last place in the app choosing a language by
// who was reading rather than by Accept-Language, and it made two real
// combinations unreachable — Jenn on an fr-CA browser, and a student on an
// English one. Splitting the axes reaches all four.
export function versionLabel(
  slot: VersionSlot,
  audience: VersionAudience,
  studentName: string,
  locale: Locale,
): string {
  const tabs = getStrings(locale).worksheet.tabs;

  if (slot === "blank") return tabs.blank;

  if (audience === "student") {
    return slot === "student" ? tabs.myAnswers : tabs.teacherCorrection;
  }
  return slot === "student"
    ? tabs.studentAnswers(studentName)
    : tabs.myCorrection;
}
