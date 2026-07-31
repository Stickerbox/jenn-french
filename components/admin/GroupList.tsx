"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { canDeleteGroup } from "@/lib/everyone";

export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  isEveryone: boolean;
  unread: number;
  chatToken: string | null;
  filesToken: string | null;
};

export function GroupList({
  groups,
  onDelete,
  onRegenerate,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
  onRegenerate: (groupId: string, slug: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmingRegen, setConfirmingRegen] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : "Could not delete the student");
    } finally {
      setDeleting(null);
    }
  }

  async function handleRegenerate(id: string, slug: string) {
    setRegenerating(id);
    setError(null);
    try {
      await onRegenerate(id, slug);
      setConfirmingRegen(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make new links");
    } finally {
      setRegenerating(null);
    }
  }

  if (groups.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        No students yet.
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField label="Search students" value={query} onChange={setQuery} />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          Nothing matches that.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((group) => (
            <li key={group.id}>
              <Tile
                href={`/g/${group.slug}?k=${group.chatToken ?? ""}`}
                title={group.name}
                eyebrow={`/g/${group.slug}${
                  group.unread > 0 ? ` · ${group.unread} unread` : ""
                }`}
                action={
                  canDeleteGroup(group) ? (
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
                  ) : (
                    <span className="text-sm text-[var(--color-ink-muted)]">
                      everyone
                    </span>
                  )
                }
              />

              {confirming === group.id && (
                <div className="mt-2 flex flex-wrap items-baseline justify-center gap-3 text-sm">
                  <span className="text-[var(--color-ink-muted)]">
                    Delete {group.name}?
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

              {group.chatToken && (
                <>
                  <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                    <code className="break-all">
                      /g/{group.slug}?k={group.chatToken}
                    </code>
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmingRegen(group.id);
                    }}
                    className="mt-1 text-xs text-[var(--color-ink-muted)] underline"
                  >
                    Make new links
                  </button>

                  {confirmingRegen === group.id && (
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                      <span>
                        Make new links for {group.name}? Their old links stop
                        working.
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmingRegen(null)}
                        disabled={regenerating !== null}
                        className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerate(group.id, group.slug)}
                        disabled={regenerating !== null}
                        className="mt-1 text-xs text-[var(--color-ink-muted)] underline disabled:opacity-50"
                      >
                        {regenerating === group.id
                          ? "Making new links…"
                          : "Make new links"}
                      </button>
                    </div>
                  )}
                </>
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
