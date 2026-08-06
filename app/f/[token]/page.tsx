import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { FilesTab } from "@/components/student/FilesTab";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";

// noindex on every student surface: the token is the only thing protecting
// this, and a crawler that found one would publish it.
export const metadata = { robots: { index: false, follow: false } };

// Not in Task H1's own file list, but necessary plumbing: this is the other
// server-side caller of FilesTab (components/student/FilesTab.tsx), which is
// now a client component that takes `locale` as a prop rather than reading it
// itself, and takes `locale` alone rather than the resolved `strings` object
// — a `Strings` value cannot cross the server/client boundary, see
// lib/strings.ts — and rebuilds the dictionary with getStrings(locale).
export default async function StudentFilesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const group = await prisma.group.findUnique({
    where: { filesToken: token },
    select: { id: true, name: true, slug: true },
  });
  // 404 rather than 403, so a crawler cannot tell a real student's link from
  // a made-up one.
  if (!group) notFound();

  const locale = await currentLocale();
  const strings = getStrings(locale);

  const pages = await listPagesForGroup(group.id);
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <header className="mx-auto mb-8 max-w-[560px] text-center">
        <div className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          {strings.student.filesPage.eyebrow}
        </div>
        <h1
          className="font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.15 }}
        >
          {group.name}
        </h1>
      </header>

      {/* Read-only. filesToken addresses this shelf and nothing else; a link
          shared with a parent must not carry the power to add, pin, or open a
          version chooser and save into it — groupSlug null is what keeps a
          worksheet tile here pointed at the public page rather than a route
          that writes. */}
      <FilesTab
        pages={pages}
        today={today}
        canWrite={false}
        groupSlug={null}
        locale={locale}
      />

      <p className="mt-8 text-center">
        <Link
          href={`/g/${group.slug}`}
          className="font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-bleu)] underline"
        >
          {strings.student.filesPage.backToCard}
        </Link>
      </p>
    </main>
  );
}
