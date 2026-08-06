import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { readBoundedBody } from "@/lib/bounded-body";
import { MAX_SNAPSHOT_BYTES, validateSnapshot } from "@/lib/page-snapshot";
import { validatePagePdf } from "@/lib/page-pdf";
import { saveHtmlVersion, savePdfVersion } from "@/lib/version-store";
import { createMessage } from "@/lib/messages";
import { versionNotice } from "@/lib/version-notice";

// Room for JSON syntax and multi-byte UTF-8 around a snapshot already capped at
// MAX_SNAPSHOT_BYTES, the way MAX_CHAT_BYTES gives roughly 4x headroom over
// MAX_MESSAGE_LENGTH for the same reason. That ratio does not transfer
// directly at megabyte scale — 4x here would clear nginx's 4 MB
// client_max_body_size before the request even arrives — so this instead
// splits the room left between the two caps: MAX_SNAPSHOT_BYTES is measured
// as raw UTF-8 bytes in the browser, but the snapshot travels JSON-encoded,
// where every `"` becomes `\"` and every control character expands. 512 KB
// (~17% of the snapshot cap) is far more than that escaping can cost even on
// an attribute-dense worksheet, and still leaves ~512 KB of margin below
// nginx's limit — which is what MAX_SNAPSHOT_BYTES was chosen against, so
// this must not exceed it.
const MAX_BODY_BYTES = MAX_SNAPSHOT_BYTES + 512 * 1024;

// A POST route and NOT a server action. Server actions cap request bodies at
// 1 MB by default, and raising that limit globally to serve one feature is
// worse than a scoped route that counts bytes as they arrive.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  // Save always writes to the CALLER'S OWN slot, from whatever version they
  // were looking at. One rule, no modes: a student who opens Jenn's correction,
  // fixes their mistakes and saves writes their own version. There is nothing
  // in the request that says which slot, so there is nothing to forge.
  const fromTeacher = context.role === "teacher";

  if (context.page.kind === "pdf") {
    const form = await request.formData();
    const file = form.get("pdf");
    if (!(file instanceof File)) {
      return new NextResponse("A PDF file is required.", { status: 400 });
    }
    // Bytes as a File in FormData, exactly as addShelfPdf takes them: base64
    // costs a third more, and 3 MB of PDF would arrive as 4 MB against nginx's
    // 4 MB limit.
    const checked = validatePagePdf(new Uint8Array(await file.arrayBuffer()));
    if (!checked.ok) return new NextResponse(checked.error, { status: 400 });

    await savePdfVersion({
      pageId: context.page.id,
      groupId: context.group.id,
      fromTeacher,
      pdf: checked.bytes,
    });
  } else {
    const text = await readBoundedBody(request, MAX_BODY_BYTES);
    if (text === null) return new NextResponse("That page is too large.", { status: 400 });

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return new NextResponse("Bad request", { status: 400 });
    }

    const checked = validateSnapshot(
      (payload as { html?: unknown } | null)?.html ?? null,
    );
    if (!checked.ok) return new NextResponse(checked.error, { status: 400 });

    await saveHtmlVersion({
      pageId: context.page.id,
      groupId: context.group.id,
      fromTeacher,
      html: checked.html,
    });
  }

  // After the write, never before — the ordering rule createMessage states
  // about chatBus.publish, and the contract addChatLinks has: a notification
  // that fails must not cost the homework it was announcing.
  //
  // The everyone group needs no clause: chatRole refused it inside
  // resolveWorksheet, before it checked anything else.
  //
  // ORIGIN first, the request's own origin as the fallback — the same choice
  // app/api/pages/route.ts makes at its line 141: this process sits behind
  // nginx, so request.url can carry an internal hostname or port the
  // student's browser cannot reach, where ORIGIN is the public domain set
  // once in deployment. The fallback exists for local dev, where ORIGIN is
  // unset and the request's own origin IS the address to use.
  //
  // One path for both page kinds: /g/[slug]/w/[pageSlug] itself redirects a
  // pdf worksheet to its own viewer, so this link works whether the saved
  // version was html or pdf.
  //
  // Deliberately NOT run through addChatLinks: that would file this URL as a
  // second link tile on the shelf pointing at a worksheet the shelf already
  // shows as a tile — a duplicate, not a new page.
  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  const worksheetUrl = `${origin}/g/${context.group.slug}/w/${context.page.slug}`;

  try {
    await createMessage(
      context.group.id,
      fromTeacher,
      versionNotice(context.page.title, fromTeacher, context.group.name, worksheetUrl),
    );
  } catch {
    // Deliberately swallowed, for the reason above.
  }

  // The shelf's badge and the chooser both read the version list.
  revalidatePath("/g/[slug]", "page");

  return new NextResponse(null, { status: 204 });
}
