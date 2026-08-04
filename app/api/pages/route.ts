import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { readPageKind } from "@/lib/page-kind";
import { MAX_UPLOAD_BYTES, parsePagePayload } from "@/lib/page-payload";
import { assetBundle } from "@/lib/page-bundle";
import { inlinePage } from "@/lib/page-inline";
import { readBoundedBody } from "@/lib/bounded-body";

// Hash both sides first so the comparison is over two equal-length buffers:
// timingSafeEqual throws on a length mismatch, and that throw would itself
// leak how long the real token is.
function tokenMatches(supplied: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

// Derived rather than written out, so the number the teacher is shown cannot
// drift from the number enforced. tools/publish-dia-artifact.sh prints this
// verbatim, which is why that script carries no size limit of its own.
const TOO_BIG = `That upload is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;

// A cross-origin caller — the browser extension in tools/publish-extension —
// sends a preflight before a POST carrying Authorization and a JSON body.
// Without a handler the preflight would 405 and the publish would fail with an
// error that says nothing about why. `*` is safe here because the endpoint
// authenticates on a bearer token and never on a cookie: a hostile page can
// reach it only if it already holds the token, in which case it did not need a
// browser to do so.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Every reply carries the same allowance the preflight promised. Answering the
// preflight alone would be worse than not answering it: the POST would succeed
// server-side, the caller would be unable to read the reply, and the teacher
// would be told publishing failed on a page that is now live.
export async function POST(request: Request) {
  const response = await publish(request);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}

async function publish(request: Request): Promise<NextResponse> {
  // Unset token means the endpoint does not exist — a 404 rather than a 401,
  // so a deployment that has not opted in gives nothing away.
  const expected = process.env.PAGES_UPLOAD_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tokenMatches(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  }

  const text = await readBoundedBody(request, MAX_UPLOAD_BYTES);
  if (text === null) {
    return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  const parsed = parsePagePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { title, html, groups, slug, assets } = parsed.payload;

  let groupIds: string[] | null = null;
  if (groups) {
    const found = await prisma.group.findMany({
      where: { slug: { in: groups } },
      select: { id: true, slug: true },
    });
    const missing = groups.filter((g) => !found.some((f) => f.slug === g));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown group: ${missing.join(", ")}` },
        { status: 404 },
      );
    }
    groupIds = found.map((f) => f.id);
  }

  // Without this the publish extension would silently convert a link — or a
  // stored PDF — into a page, at a slug students already hold. This endpoint
  // publishes documents and nothing else, so anything that is not html is
  // refused rather than replaced.
  if (slug) {
    const existing = await prisma.page.findUnique({
      where: { slug },
      select: { kind: true, url: true, pdfSize: true },
    });
    if (existing && readPageKind(existing) !== "html") {
      return NextResponse.json(
        { error: "That slug belongs to a link or a PDF." },
        { status: 400 },
      );
    }
  }

  // Between validation and the save, so what lands in the database is the
  // self-contained document. The bundle holds the files uploaded beside it, and
  // assetBundle keys them the way the document's own refs are keyed.
  // /p/[slug]/raw still serves page.html byte for byte, which is what keeps the
  // download-and-re-edit round trip honest.
  const inlined = await inlinePage(html, assetBundle(assets));

  const saved = await savePage({
    slug,
    kind: "html",
    title,
    html: inlined.html,
    groupIds,
  });

  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  // `skipped` is always present, empty included: a caller that has to test for
  // the key's existence will eventually forget to.
  return NextResponse.json(
    { url: `${origin}/p/${saved}`, skipped: inlined.skipped },
    { status: 201 },
  );
}
