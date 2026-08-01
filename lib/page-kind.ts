export type PageKind = "html" | "link";

// Prisma has no enum support on SQLite, so `kind` is a String and the database
// type is wider than this one. Same defensive contract as readSections and
// readOps: a row a later migration or a hand-edited database produced must not
// crash a shelf.
//
// It reads `url` and not `html` on purpose — the shelf queries never select
// `html`, because that column holds a whole document and selecting it to render
// a grid of thumbnails would pull every page's markup to draw a list of titles.
export function readPageKind(row: { kind: string; url: string | null }): PageKind {
  if (row.kind === "link") return "link";
  if (row.kind === "html") return "html";
  return row.url !== null ? "link" : "html";
}
