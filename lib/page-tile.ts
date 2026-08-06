import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type PageAudience = {
  groupNames: string[];
  sharedWithEveryone: boolean;
};

// Everyone wins over the names beside it: a page on the everyone group is on
// every student's shelf, so listing the two students it is also assigned to
// would describe a smaller reach than it has.
//
// Names themselves (`groupNames`) are never translated — they are what Jenn
// typed for each student — so only the two fixed phrases need a locale.
// Defaulted, like lib/format.ts's formatCardDate and formatLongDate, to
// DEFAULT_LOCALE rather than made required, so a caller outside Task H2's
// ownership keeps compiling and keeps rendering in French, this project's
// fallback, with no edit forced on a file this task does not own.
export function pageAudienceLabel(
  page: PageAudience,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (page.sharedWithEveryone) {
    return locale === "en" ? "shared with everyone" : "partagé avec tous";
  }
  if (page.groupNames.length === 0) {
    return locale === "en" ? "no students" : "aucun élève";
  }
  return page.groupNames.join(", ");
}
