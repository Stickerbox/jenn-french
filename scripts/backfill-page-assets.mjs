// One-off, run once per environment. Idempotent: a page with no external refs
// is left alone, so re-running is safe and a second run reports nothing.
//
// Run it as:
//   node --experimental-strip-types scripts/run-ts.mjs scripts/backfill-page-assets.mjs
//
// The wrapper is what resolves the `@/` alias and the extensionless imports
// every module under lib/ uses — Node's type stripper runs the TypeScript but
// resolves modules the way Node does, so importing ../lib/*.ts directly stops
// at ERR_MODULE_NOT_FOUND before running a line.
import { PrismaClient } from "@prisma/client";
import { inlinePage } from "../lib/page-inline.ts";
import { readPageKind } from "../lib/page-kind.ts";

const prisma = new PrismaClient();

const pages = await prisma.page.findMany({
  select: { id: true, slug: true, kind: true, url: true, html: true, pdfSize: true },
});

let rewritten = 0;
let untouched = 0;
let links = 0;

for (const page of pages) {
  // A link row has no document, and readPageKind is the only thing that decides
  // which a row is — its `kind` column is a plain String on SQLite.
  if (readPageKind(page) !== "html" || page.html === null) {
    links += 1;
    continue;
  }

  const result = await inlinePage(page.html);

  for (const item of result.skipped) {
    console.log(`  ${page.slug}: ${item.url} — ${item.reason}`);
  }

  if (result.html === page.html) {
    untouched += 1;
    continue;
  }

  await prisma.page.update({
    where: { id: page.id },
    data: { html: result.html },
  });
  rewritten += 1;
}

console.log(
  `${rewritten} rewritten, ${untouched} already self-contained, ${links} link rows skipped`,
);

await prisma.$disconnect();
