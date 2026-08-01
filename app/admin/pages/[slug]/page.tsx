import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPageForAdmin } from "@/lib/pages";
import { updatePage, deletePage } from "@/app/page-actions";
import { PageEditor } from "@/components/admin/PageEditor";

export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const page = await getPageForAdmin(slug);
  // A link has no document, so there is nothing here to edit. 404 rather than
  // rendering an upload form over a row that can never accept one.
  if (!page || page.kind === "link") notFound();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto w-full max-w-[560px]">
        <Link
          href="/admin?tab=pages"
          className="mb-6 inline-block text-sm text-[var(--color-ink-muted)] underline"
        >
          ← Pages
        </Link>

        <h1 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {page.title}
        </h1>
        <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
          <a href={`/p/${page.slug}`} className="underline">
            /p/{page.slug}
          </a>{" "}
          — the link stays the same when you rename the page.
        </p>

        <PageEditor
          groups={groups}
          initial={{
            title: page.title,
            // Narrowed by the guard above: an html row always has html. The ??
            // satisfies the compiler, which cannot see that from here.
            html: page.html ?? "",
            groupIds: page.groupIds,
          }}
          submitLabel="Save page"
          onSubmit={updatePage.bind(null, page.slug)}
          onDelete={deletePage.bind(null, page.slug)}
        />
      </div>
    </main>
  );
}
