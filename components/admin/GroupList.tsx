"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  cardCount: number;
};

export function GroupList({
  groups,
  onDelete,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    setError(null);
    try {
      await onDelete(id);
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the group");
    } finally {
      setDeleting(null);
    }
  }

  if (groups.length === 0) {
    return (
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">No groups yet.</p>
    );
  }

  return (
    <>
      <ul className="mb-6 flex flex-col gap-2">
        {groups.map((group) => (
          <li key={group.id} className="flex items-baseline justify-between gap-4">
            <Link
              href={`/admin/${group.slug}`}
              className="text-[var(--color-accent)] underline"
            >
              {group.name} (/g/{group.slug})
            </Link>

            {confirming === group.id ? (
              <span className="flex shrink-0 items-baseline gap-3 text-sm">
                <span className="text-[var(--color-ink-muted)]">
                  Delete
                  {group.cardCount > 0
                    ? ` and its ${group.cardCount} card${group.cardCount === 1 ? "" : "s"}?`
                    : "?"}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  disabled={deleting !== null}
                  className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(group.id)}
                  disabled={deleting !== null}
                  className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
                >
                  {deleting === group.id ? "Deleting…" : "Delete"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming(group.id);
                }}
                className="shrink-0 text-sm text-[var(--color-ink-muted)] underline"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mb-6 text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </>
  );
}
