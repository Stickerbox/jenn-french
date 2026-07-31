import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  upsertOverrideCard,
  deleteOverrideCard,
  deleteMessage,
  markChatRead,
} from "@/app/actions";
import { CardEditor } from "@/components/admin/CardEditor";
import { AdminDatePicker } from "@/components/admin/AdminDatePicker";
import { toCardFormValues } from "@/lib/cards";
import { parseAdminDate } from "@/lib/admin-date";
import { ChatFab } from "@/components/chat/ChatFab";

export default async function GroupAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const { date } = await searchParams;

  const group = await prisma.group.findUnique({
    where: { slug },
    include: { cards: { orderBy: { date: "desc" } } },
  });
  if (!group) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const selected = parseAdminDate(date, today);
  const selectedDate = new Date(`${selected}T00:00:00Z`);

  // group.cards is already the group's full card list (fetched above), so
  // find the selected date's override there instead of issuing a second query.
  const existingCard =
    group.cards.find((card) => card.date.getTime() === selectedDate.getTime()) ??
    null;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl lg:max-w-[1152px]">
        <h1 className="mx-auto mb-8 w-full max-w-[560px] font-[family-name:var(--font-display)] text-3xl italic text-[var(--color-ink)] lg:mx-0">
          {group.name} overrides
        </h1>

        <CardEditor
          key={selected}
          initialDate={selected}
          initialValues={toCardFormValues(existingCard)}
          datePicker={
            <AdminDatePicker
              basePath={`/admin/${slug}`}
              selected={selected}
              today={today}
            />
          }
          onSubmit={upsertOverrideCard.bind(null, group.id, group.slug)}
          onDelete={deleteOverrideCard.bind(null, group.id, group.slug)}
        />

        <div className="mx-auto w-full max-w-[560px] lg:mx-0">
          <h2 className="mb-4 mt-12 font-[family-name:var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            Existing overrides
          </h2>
          <ul className="flex flex-col gap-1 font-[family-name:var(--font-body)] text-sm text-[var(--color-ink-muted)]">
            {group.cards.map((card) => {
              const cardDate = card.date.toISOString().slice(0, 10);
              return (
                <li key={card.id}>
                  <Link
                    href={`/admin/${slug}?date=${cardDate}`}
                    className="text-[var(--color-accent)] underline"
                  >
                    {cardDate}
                  </Link>{" "}
                  — {card.frenchAnswer}
                </li>
              );
            })}
            {group.cards.length === 0 && <li>No overrides yet.</li>}
          </ul>
        </div>

        {!group.isEveryone && (
          <ChatFab
            slug={group.slug}
            token={null}
            self="teacher"
            labels={{
              title: `Chat with ${group.name}`,
              empty: "No messages yet.",
              placeholder: "Write a message…",
              send: "Send",
              close: "Close",
              locale: "en-CA",
              deleteMessage: "Delete message",
            }}
            onDeleteMessage={deleteMessage.bind(null, group.slug)}
            onOpen={markChatRead.bind(null, group.id, group.slug)}
          />
        )}
      </div>
    </main>
  );
}
