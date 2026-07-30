export const ADMIN_TABS = ["daily", "groups", "pages"] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

// Unknown and absent values both land on the daily word, because that is the
// screen /admin exists for. A mistyped ?tab= should show her today's card,
// not an error page.
export function parseAdminTab(value: string | undefined): AdminTab {
  const tabs: readonly string[] = ADMIN_TABS;
  return tabs.includes(value ?? "") ? (value as AdminTab) : "daily";
}
