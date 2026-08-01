export type LinkBrand =
  | "google-docs"
  | "google-sheets"
  | "google-slides"
  | "google-forms"
  | "google-drive"
  | "youtube"
  | "pdf"
  | "generic";

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Chosen from the URL alone — no request is made, by the server or the browser.
// A server-side og:image fetch would be request forgery on a student-supplied
// URL, and would return a sign-in page for the case this exists to serve: a
// Google Doc that is not public.
export function linkBrand(url: string): LinkBrand {
  const host = hostOf(url);
  if (host === null) return "generic";

  // Safe: hostOf already proved this parses.
  const path = new URL(url).pathname.toLowerCase();

  if (host === "docs.google.com") {
    if (path.startsWith("/document")) return "google-docs";
    if (path.startsWith("/spreadsheets")) return "google-sheets";
    if (path.startsWith("/presentation")) return "google-slides";
    if (path.startsWith("/forms")) return "google-forms";
    return "google-drive";
  }

  if (host === "drive.google.com") return "google-drive";
  if (host === "sheets.google.com") return "google-sheets";
  if (host === "slides.google.com") return "google-slides";
  if (host === "forms.gle" || host === "forms.google.com") return "google-forms";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    return "youtube";
  }

  // pathname, not the whole URL: "?file=x.pdf" is a query on an HTML page.
  if (path.endsWith(".pdf")) return "pdf";

  return "generic";
}

export function linkHostLabel(url: string): string {
  return hostOf(url) ?? "";
}
