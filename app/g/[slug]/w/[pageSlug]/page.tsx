import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";
import { studentGate } from "@/lib/student-gate";
import { readToken, cookieNameFor } from "@/lib/student-tokens";
import { resolveWorksheet } from "@/lib/worksheet-context";
import { listVersions } from "@/lib/version-store";
import { slotForVersion, type VersionSlot } from "@/lib/version-labels";
import { WorksheetShell } from "@/components/worksheet/WorksheetShell";

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

  // A pdf worksheet has no shell: it opens in the browser's own viewer, where
  // there is nowhere to put a control. The chooser on the shelf is its only
  // surface, so a direct hit here goes straight to the document.
  //
  // Before listVersions, not after: the redirect needs none of them.
  if (context.page.kind === "pdf") {
    redirect(`/g/${slug}/w/${pageSlug}/pdf?v=${readSlot(v)}`);
  }

  const versions = await listVersions(context.page.id, context.group.id);
  const slots: VersionSlot[] = [
    "blank",
    ...versions.map((version) => slotForVersion(version.fromTeacher)),
  ];

  return (
    <WorksheetShell
      groupSlug={slug}
      pageSlug={pageSlug}
      title={context.page.title}
      audience={context.role === "teacher" ? "teacher" : "student"}
      studentName={context.group.name}
      slot={readSlot(v)}
      slots={slots}
    />
  );
}
