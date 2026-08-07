import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { deleteVersion } from "@/lib/version-store";

// Deletes the caller's OWN row. One rule, two names in the interface:
// "Recommencer" to a student, "Delete correction" to Jenn.
//
// A student needs it because auto-save took away their way out of an inert
// worksheet. A Dia worksheet answered by clicking comes back with every script
// stripped and nothing left to click; under two tabs they went back to the
// blank and started again, and under one tab this is the only way back.
//
// Jenn needs it because her read-only tabs must be reversible. One stray
// keystroke on the blank creates a correction and locks the other two, and
// there is no other control that unlocks them.
//
// It is not a version history. The row is gone, which is why the button
// confirms first. Deleting one party's row never touches the other's: they are
// two rows, and this names exactly one.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; pageSlug: string }> },
) {
  const { slug, pageSlug } = await params;
  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) return new NextResponse("Not found", { status: 404 });

  await deleteVersion(
    context.page.id,
    context.group.id,
    context.role === "teacher",
  );

  // The shelf's version badge counts rows, so it has to be told.
  revalidatePath("/g/[slug]", "page");
  return new NextResponse(null, { status: 204 });
}
