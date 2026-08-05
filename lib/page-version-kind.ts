export type VersionKind = "html" | "pdf";

// The version-row sibling of readPageKind, and deliberately NOT that function.
// It can return "link", which is impossible here — a link row cannot be a
// worksheet — and reusing it would push a dead case into every caller.
//
// Same defensive contract as readPageKind, readSections and readOps: resolve on
// the content signal rather than trusting the string, because the row most
// likely to be broken is one with content and a wrong kind.
export function readVersionKind(row: {
  kind: string;
  pdfSize: number | null;
}): VersionKind {
  if (row.kind === "pdf") return "pdf";
  if (row.kind === "html") return "html";
  return row.pdfSize !== null ? "pdf" : "html";
}
