import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPageForAdmin } from "@/lib/pages";
import { updatePage, updatePdfPage, deletePage } from "@/app/page-actions";
import { PageEditor } from "@/components/admin/PageEditor";
import { TeacherInbox } from "@/components/chat/TeacherInbox";
import { audienceOptions } from "@/lib/audience";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";

export default async function AdminPageEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  // `strings` is for this page's own server-rendered text; `locale` is the
  // prop PageEditor (a client component) actually takes — a resolved
  // `Strings` object cannot cross the server/client boundary, see
  // lib/strings.ts.
  const locale = await currentLocale();
  const strings = getStrings(locale);

  const { slug } = await params;
  const page = await getPageForAdmin(slug);
  // A link has no document, so there is nothing here to edit. 404 rather than
  // rendering an upload form over a row that can never accept one. A pdf row
  // can: replacing the file, the title or the audience all belong here.
  if (!page || page.kind === "link") notFound();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, isEveryone: true },
  });

  return (
    // The same card-page background every other admin surface now uses —
    // see app/admin/page.tsx's header comment for why.
    <main
      className="relative min-h-screen px-4 py-12"
      style={{ background: "var(--card-page-bg)" }}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <Link
          href="/admin?tab=pages"
          className="mb-6 inline-block text-sm text-[var(--color-ink-muted)] underline"
        >
          {strings.admin.standalonePage.backToPages}
        </Link>

        <h1 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl italic text-[var(--card-ink)]">
          {page.title}
        </h1>
        <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
          <a href={`/p/${page.slug}`} className="underline">
            /p/{page.slug}
          </a>{" "}
          {strings.admin.standalonePage.linkNote}
        </p>

        <PageEditor
          audience={audienceOptions(
            groups,
            strings.admin.pageForm.allStudents,
          )}
          initial={{
            title: page.title,
            // Empty for a pdf row, which has no document to hold. The kind
            // below is what decides which of the two the form submits.
            html: page.html ?? "",
            groupIds: page.groupIds,
            kind: page.kind,
            pdfSize: page.pdfSize,
            worksheet: page.worksheet,
          }}
          submitLabel={strings.admin.standalonePage.saveLabel}
          onSubmit={updatePage.bind(null, page.slug)}
          onSubmitPdf={updatePdfPage.bind(null, page.slug)}
          onDelete={deletePage.bind(null, page.slug)}
          locale={locale}
        />
      </div>

      {/* Outside the width wrapper: the FAB is fixed-positioned, and nesting it
          inside a content column would imply the column constrains it. */}
      <TeacherInbox />
    </main>
  );
}
