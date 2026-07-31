import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { FilesTab } from "@/components/student/FilesTab";

// noindex on every student surface: the token is the only thing protecting
// this, and a crawler that found one would publish it.
export const metadata = { robots: { index: false, follow: false } };

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

  const pages = await listPagesForGroup(group.id);

  return (
    <main
      className="min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <header className="mx-auto mb-8 max-w-[560px] text-center">
        <div className="mb-2.5 font-[family-name:var(--card-font-serif)] text-[13px] uppercase tracking-[6px] text-[var(--card-bleu)] opacity-80">
          ⚜ Les ressources ⚜
        </div>
        <h1
          className="font-[family-name:var(--card-font-serif)] text-[var(--card-plum)]"
          style={{ fontSize: "clamp(28px, 5vw, 38px)", lineHeight: 1.15 }}
        >
          {group.name}
        </h1>
      </header>

      <FilesTab pages={pages} />

      <p className="mt-8 text-center">
        <Link
          href={`/g/${group.slug}`}
          className="font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-bleu)] underline"
        >
          ← La carte du jour
        </Link>
      </p>
    </main>
  );
}
