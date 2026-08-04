export type PageKind = "html" | "link" | "pdf";

// Prisma has no enum support on SQLite, so `kind` is a String and the database
// type is wider than this one. Same defensive contract as readSections and
// readOps: a row a later migration or a hand-edited database produced must not
// crash a shelf.
//
// `pdfSize` is REQUIRED rather than optional, which costs every caller a line in
// its `select`. That is the point. This function exists to resolve an
// inconsistent row, and a caller that quietly omitted the pdf signal would have
// a broken pdf row resolved as "html" — an empty iframe, which is the precise
// failure this function was written to prevent. Optional would compile
// everywhere and be wrong in the one case that matters.
//
// It reads `url` and `pdfSize`, never `html` or `pdf`: the shelf queries select
// neither of those, because one holds a whole document and the other a whole
// file, and loading either to draw a grid of titles is what these omissions
// exist to stop.
export function readPageKind(row: {
  kind: string;
  url: string | null;
  pdfSize: number | null;
}): PageKind {
  if (row.kind === "link") return "link";
  if (row.kind === "pdf") return "pdf";
  if (row.kind === "html") return "html";

  // Resolve toward the row most likely to be real, stored file first.
  if (row.pdfSize !== null) return "pdf";
  return row.url !== null ? "link" : "html";
}
