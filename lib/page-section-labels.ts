import type { SectionKey } from "@/lib/page-sections";
import { MONTHS } from "@/lib/week";

export function adminSectionLabel(key: SectionKey): string {
  switch (key.kind) {
    case "pinned":
      return "Pinned";
    case "thisWeek":
      return "This week";
    case "lastWeek":
      return "Last week";
    case "month":
      // MONTHS is already uppercase and 0-indexed, like key.month.
      return `${MONTHS[key.month]} ${key.year}`;
  }
}

export function studentSectionLabel(key: SectionKey): string {
  switch (key.kind) {
    case "pinned":
      return "Épinglé";
    case "thisWeek":
      return "Cette semaine";
    case "lastWeek":
      return "La semaine dernière";
    case "month":
      // Built through the same fr-CA/UTC path the student's dates already take,
      // rather than a second hand-written month table to keep in step.
      return new Date(Date.UTC(key.year, key.month, 1))
        .toLocaleDateString("fr-CA", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
        .toUpperCase();
  }
}
