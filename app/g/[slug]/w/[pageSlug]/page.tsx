import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { studentGate } from "@/lib/student-gate";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { listVersions } from "@/lib/version-store";
import {
  slotForVersion,
  type VersionSlot,
} from "@/lib/version-labels";
import { canSaveFromSlot } from "@/lib/worksheet-save-slots";
import { currentLocale } from "@/lib/locale";
import { WorksheetShell } from "@/components/worksheet/WorksheetShell";
import { PdfShell } from "@/components/pdf/PdfShell";
import { WorksheetHeading } from "@/components/worksheet/WorksheetHeading";
import { PdfDocumentView } from "@/components/pdf/PdfDocumentView";
import { UploadVersion } from "@/components/worksheet/UploadVersion";

export const metadata: Metadata = {
  // Nothing behind a token should ever reach an index.
  robots: { index: false, follow: false },
};

function readSlot(value: string | undefined): VersionSlot {
  if (value === "student" || value === "teacher") return value;
  return "blank";
}

export default async function WorksheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { slug, pageSlug } = await params;
  const { v } = await searchParams;

  const context = await resolveWorksheet(slug, pageSlug);
  if (!context) notFound();

  // The shell asks for MORE than chatRole: a student must be `unlocked`, so an
  // invite-holder who has not signed up yet cannot file work. The routes below
  // it keep chatRole alone, matching the chat exactly.
  if (context.role === "student") {
    const group = await prisma.group.findUnique({
      where: { id: context.group.id },
      select: { isEveryone: true, chatToken: true, passwordHash: true },
    });
    const presented = readToken(
      undefined,
      (await cookies()).get(cookieNameFor(slug))?.value,
    );
    const gate = studentGate({
      isTeacher: Boolean(await getCurrentTeacher()),
      isEveryone: group?.isEveryone ?? false,
      chatToken: group?.chatToken ?? null,
      presented,
      claimed: group?.passwordHash != null,
    });
    if (gate !== "signed-in") redirect(`/g/${slug}?tab=files`);
  }

  const versions = await listVersions(context.page.id, context.group.id);
  const slots: VersionSlot[] = [
    "blank",
    ...versions.map((version) => slotForVersion(version.fromTeacher)),
  ];
  const audience = context.role === "teacher" ? "teacher" : "student";
  const slot = readSlot(v);

  // A pdf worksheet used to redirect out to /g/[slug]/w/[pageSlug]/pdf and
  // open in the browser's own viewer, for the same reason /p/[slug] once did
  // — there was nowhere in that viewer to put a control. As of 2026-08-06
  // there is: PdfShell draws the same chrome WorksheetShell does around
  // PdfDocumentView's rasterised pages instead of an iframe. The raw route is
  // untouched — it is now this view's byte source AND its fallback, exactly
  // as /p/[slug]/pdf is for /p/[slug].
  if (context.page.kind === "pdf") {
    const locale = await currentLocale();
    const pdfHref = `/g/${slug}/w/${pageSlug}/pdf?v=${slot}`;
    // Matches WorksheetShell's own back control exactly — same target, same
    // audience split — rather than a second copy keyed by locale. See
    // CLAUDE.md's note on why the worksheet route still splits by audience
    // instead of the browser's language: this predates that convention and
    // migrating it is a separate decision from adding a pdf viewer beside it.
    const backLabel = audience === "teacher" ? "Back to files" : "Les fichiers";

    return (
      <PdfShell
        ariaLabel={audience === "teacher" ? "Versions" : "Versions du devoir"}
        back={{ kind: "link", href: `/g/${slug}?tab=files`, label: backLabel }}
        center={
          <WorksheetHeading
            slots={slots}
            slot={slot}
            audience={audience}
            studentName={context.group.name}
            title={context.page.title}
          />
        }
        actions={
          // canSaveFromSlot is reused rather than re-expressed: a student
          // must never be offered an upload while looking at Jenn's
          // correction, for the reason lib/worksheet-save-slots.ts records —
          // the route writes the CALLER's own slot regardless of which view
          // asked, so that upload would file Jenn's marks as the student's
          // own attempt and destroy the record of what they actually handed
          // in.
          canSaveFromSlot(slot, audience) && (
            // Capped rather than left to fill the whole `1fr` action track,
            // which can be several hundred pixels wide on a desktop nav bar —
            // FileDropZone was built for a narrow dialog column
            // (VersionChooser) and stretching it that far reads as a mistake
            // rather than a control.
            <div className="w-full max-w-[220px]">
              <UploadVersion groupSlug={slug} pageSlug={pageSlug} audience={audience} />
            </div>
          )
        }
      >
        <PdfDocumentView src={pdfHref} fallbackHref={pdfHref} locale={locale} />
      </PdfShell>
    );
  }

  return (
    <WorksheetShell
      groupSlug={slug}
      pageSlug={pageSlug}
      title={context.page.title}
      audience={audience}
      studentName={context.group.name}
      slot={slot}
      slots={slots}
    />
  );
}
