import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { savePage } from "@/lib/pages";
import { parsePagePayload } from "@/lib/page-payload";
import { MAX_PAGE_BYTES } from "@/lib/page-html";

// Hash both sides first so the comparison is over two equal-length buffers:
// timingSafeEqual throws on a length mismatch, and that throw would itself
// leak how long the real token is.
function tokenMatches(supplied: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

// Content-Length is a claim, not a fact: a chunked request omits it entirely
// and a hostile one can lie. Counting bytes as they arrive is what actually
// bounds how much a caller can make the process buffer, and it stops reading
// the moment the cap is passed rather than after the whole body has landed.
async function readBoundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
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
  if (declaredLength > MAX_PAGE_BYTES) {
    return NextResponse.json({ error: "That page is larger than 2 MB." }, {
      status: 413,
    });
  }

  const text = await readBoundedBody(request);
  if (text === null) {
    return NextResponse.json({ error: "That page is larger than 2 MB." }, {
      status: 413,
    });
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

  const { title, html, groups, slug } = parsed.payload;

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

  const saved = await savePage({ slug, title, html, groupIds });

  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  return NextResponse.json({ url: `${origin}/p/${saved}` }, { status: 201 });
}
