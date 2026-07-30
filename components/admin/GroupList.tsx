"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";

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
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = filterGroups(groups, query);

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
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No groups yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField
        label="Search groups"
        value={query}
        onChange={setQuery}
        shown={visible.length}
        total={groups.length}
      />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((group) => (
            <li key={group.id}>
              <Tile
                href={`/admin/${group.slug}`}
                title={group.name}
                eyebrow={`${group.cardCount} card${
                  group.cardCount === 1 ? "" : "s"
                } · /g/${group.slug}`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirming(group.id);
                    }}
                    className="text-sm text-[var(--color-ink-muted)] underline"
                  >
                    Delete
                  </button>
                }
              />

              {confirming === group.id && (
                <div className="mt-2 flex flex-wrap items-baseline justify-center gap-3 text-sm">
                  <span className="text-[var(--color-ink-muted)]">
                    Delete {group.name}
                    {group.cardCount > 0
                      ? ` and its ${group.cardCount} card${
                          group.cardCount === 1 ? "" : "s"
                        }?`
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
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-[var(--color-accent)]">
          {error}
        </p>
      )}
    </div>
  );
}
