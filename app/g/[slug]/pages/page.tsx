import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listPagesForGroup } from "@/lib/pages";
import { formatLongDate } from "@/lib/format";
import { Tile } from "@/components/ui/Tile";

export default async function GroupPagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const group = await prisma.group.findUnique({ where: { slug } });
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
          <Link href={`/g/${slug}`} className="transition-opacity hover:opacity-75">
            {group.name}
          </Link>
        </h1>
      </header>

      <div className="mx-auto max-w-[560px]">
        {pages.length === 0 ? (
          <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
            Nothing here yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.slug}>
                <Tile
                  href={`/p/${page.slug}`}
                  title={page.title}
                  eyebrow={formatLongDate(page.createdAt)}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center">
          <Link
            href={`/g/${slug}`}
            className="font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-bleu)] underline"
          >
            ← La carte du jour
          </Link>
        </p>
      </div>
    </main>
  );
}
