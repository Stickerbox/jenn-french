import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { findVersionMeta, markVersionSent } from "@/lib/version-store";
import { createMessage } from "@/lib/messages";
import { versionNotice } from "@/lib/version-notice";

// The notice a save used to post by itself. Moving it here is the point of the
// whole change: a student revising three times told Jenn three times that the
// homework was finished, and auto-save would have made that forty times.
//
// It carries no body. Everything it needs is the caller's identity and which
// page they are on, and both come from the URL and the cookie — so there is
// nothing to bound and nothing to parse.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  // The same gate the save route uses, reused whole: chatRole inside it
  // already refuses the everyone group before it checks the teacher, so
  // neither party can announce a version on /g/all, where there is no student
  // for one to belong to.
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  // The caller's own row, exactly as a save writes the caller's own slot.
  // There is nothing in the request that says which row, so there is nothing
  // to forge.
  const fromTeacher = context.role === "teacher";

  const existing = await findVersionMeta(
    context.page.id,
    context.group.id,
    fromTeacher,
  );
  if (!existing) return new NextResponse("Nothing to send.", { status: 400 });

  // ORIGIN first, the request's own origin as the fallback — the choice
  // app/api/pages/route.ts makes for the same reason: this process sits behind
  // nginx, so request.url can carry an internal hostname the student's browser
  // cannot reach, where ORIGIN is the public domain set once in deployment.
  // The fallback exists for local dev, where ORIGIN is unset.
  //
  // Deliberately NOT run through addChatLinks: that would file this URL as a
  // second link tile on the shelf pointing at a worksheet the shelf already
  // shows as a tile.
  const origin = process.env.ORIGIN ?? new URL(request.url).origin;
  const worksheetUrl = `${origin}/g/${context.group.slug}/w/${context.page.slug}`;

  // THE MESSAGE FIRST, THE MARK SECOND, and the failure is NOT swallowed.
  // This inverts what the save route did on purpose. There, the notice was a
  // courtesy beside the homework, so a failed notice must not cost the write.
  // Here the notice IS the request, and sentAt is only the record that it went
  // — so marking first would grey the button out over a message nobody
  // received, with no way to press it again.
  await createMessage({
    groupId: context.group.id,
    fromTeacher,
    body: versionNotice(context.page.title, fromTeacher, context.group.name),
    automated: true,
    href: worksheetUrl,
  });

  await markVersionSent(context.page.id, context.group.id, fromTeacher);

  revalidatePath("/g/[slug]", "page");
  return new NextResponse(null, { status: 204 });
}
