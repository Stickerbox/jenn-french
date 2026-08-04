"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { canDeleteGroup } from "@/lib/everyone";
import { formatLongDate } from "@/lib/format";

export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  isEveryone: boolean;
  unread: number;
  chatToken: string | null;
  // Null until the student signs up. Both move together, so either one answers
  // "claimed?" — email is the one displayed.
  email: string | null;
  claimedAt: Date | null;
};

export function GroupList({
  groups,
  onDelete,
  onReset,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
  onReset: (groupId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
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

  async function handleReset(id: string) {
    setResetting(id);
    setError(null);
    try {
      await onReset(id);
      setConfirmingReset(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset that sign-in",
      );
    } finally {
      setResetting(null);
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
                  {group.email === null ? (
                    <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                      Invitation — share once:{" "}
                      <code className="break-all">
                        /g/{group.slug}?k={group.chatToken}
                      </code>
                    </p>
                  ) : (
                    // No link once claimed: the invite has been spent, and
                    // showing a dead URL is a support call waiting to happen.
                    <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                      <span className="break-all">{group.email}</span>
                      {group.claimedAt !== null && (
                        <> · signed up {formatLongDate(group.claimedAt)}</>
                      )}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmingReset(group.id);
                    }}
                    className="mt-1 text-xs text-[var(--color-ink-muted)] underline"
                  >
                    {group.email === null ? "New invite link" : "Reset sign-in"}
                  </button>

                  {confirmingReset === group.id && (
                    <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm">
                      <span>
                        {group.email === null
                          ? `Make a new invite link for ${group.name}? The old one stops working.`
                          : `Reset sign-in for ${group.name}? Their email and password are cleared and their old links stop working. Their pages, chat and boards stay.`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmingReset(null)}
                        disabled={resetting !== null}
                        className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReset(group.id)}
                        disabled={resetting !== null}
                        className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
                      >
                        {resetting === group.id ? "Resetting…" : "Reset"}
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
