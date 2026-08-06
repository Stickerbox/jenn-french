import type { SectionKey } from "@/lib/page-sections";
import { toBCP47, type Locale } from "@/lib/i18n";

// Used to be two functions, adminSectionLabel() and studentSectionLabel(key,
// locale) — the admin unconditionally in English, the student's own dictionary
// keyed by locale, because Jenn's UI was English and a student's was French.
// Wave 3 (Task H2, 2026-08-06) puts both surfaces on the same rule — follow
// Accept-Language, French as the fallback — which made the two function
// bodies identical but for which literal each `switch` arm returned. At that
// point they were not two things any more, so they are collapsed into one.
// Both callers (components/admin/PageList.tsx and
// components/student/FilesTab.tsx) now pass their own locale in.
export function sectionLabel(key: SectionKey, locale: Locale): string {
  switch (key.kind) {
    case "pinned":
      return locale === "en" ? "Pinned" : "Épinglé";
    case "thisWeek":
      return locale === "en" ? "This week" : "Cette semaine";
    case "lastWeek":
      return locale === "en" ? "Last week" : "La semaine dernière";
    case "month":
      // Built through the UTC Intl path so there is no second hand-written
      // month table for this one label to drift from lib/week.ts's own.
      return new Date(Date.UTC(key.year, key.month, 1))
        .toLocaleDateString(toBCP47(locale), {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase();
  }
}
