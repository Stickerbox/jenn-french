export type PageAudience = {
  groupNames: string[];
  sharedWithEveryone: boolean;
};

// Everyone wins over the names beside it: a page on the everyone group is on
// every student's shelf, so listing the two students it is also assigned to
// would describe a smaller reach than it has.
export function pageAudienceLabel(page: PageAudience): string {
  if (page.sharedWithEveryone) return "shared with everyone";
  if (page.groupNames.length === 0) return "no students";
  return page.groupNames.join(", ");
}
