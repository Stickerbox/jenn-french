"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Link2, Trash2 } from "lucide-react";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { canDeleteGroup } from "@/lib/everyone";
import { formatLongDate } from "@/lib/format";
import { tileActionClass } from "@/components/card-styles";

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
  // Which row just had its invite copied, so its icon can say so for a moment.
  const [copied, setCopied] = useState<string | null>(null);
  // Only set when the clipboard API refused. The manual path has to still exist
  // rather than the button silently doing nothing.
  const [copyFallback, setCopyFallback] = useState<{
    id: string;
    url: string;
  } | null>(null);

  const visible = filterGroups(groups, query);

  async function handleCopyInvite(group: GroupSummary) {
    if (!group.chatToken) return;

    // Absolute, and built HERE rather than during render. The old printed link
    // was a relative path, which is not something she could paste into a
    // message — and window.location is not readable on the server, so a value
    // computed in render would differ between the two and break hydration.
    //
    // window.location.origin rather than the ORIGIN env var: what she wants to
    // send is a link to the site she is looking at, and where those two disagree
    // the browser is the one that is right.
    const url = `${window.location.origin}/g/${group.slug}?k=${group.chatToken}`;

    setError(null);
    setCopyFallback(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(group.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard.writeText needs a secure context — https and localhost both
      // are, so this should not fire. If it does, show the URL selected and let
      // her copy it the way she used to.
      setCopyFallback({ id: group.id, url });
    }
  }

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
          {visible.map((group) => {
            const claimed = group.claimedAt !== null;
            return (
              <li key={group.id}>
                <Tile
                  href={`/g/${group.slug}?k=${group.chatToken ?? ""}`}
                  title={group.name}
                  eyebrow={`/g/${group.slug}${
                    group.unread > 0 ? ` · ${group.unread} unread` : ""
                  }`}
                  action={
                    canDeleteGroup(group) ? (
                      <div className="flex items-center gap-1">
                        {/* Only while the invite is still live. A claimed
                            student's invite is spent, and offering to copy a dead
                            URL is a support call waiting to happen. */}
                        {!claimed && group.chatToken && (
                          <button
                            type="button"
                            onClick={() => void handleCopyInvite(group)}
                            aria-label={
                              copied === group.id
                                ? `Invite link for ${group.name} copied`
                                : `Copy invite link for ${group.name}`
                            }
                            title={
                              copied === group.id ? "Copied" : "Copy invite link"
                            }
                            className={tileActionClass}
                          >
                            {copied === group.id ? (
                              <Check size={18} aria-hidden />
                            ) : (
                              <Link2 size={18} aria-hidden />
                            )}
                          </button>
                        )}

                        {/* Present in BOTH claim states, with the label switching.
                            Unclaimed it is the only way to revoke an invite that
                            leaked before it was used; claimed it is the sign-in
                            reset. Same action either way — see the student sign-in
                            spec, which absorbed "Make new links" into this one
                            control. */}
                        {group.chatToken && (
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setConfirmingReset(group.id);
                            }}
                            aria-label={
                              claimed
                                ? `Reset sign-in for ${group.name}`
                                : `New invite link for ${group.name}`
                            }
                            title={claimed ? "Reset sign-in" : "New invite link"}
                            className={tileActionClass}
                          >
                            <KeyRound size={18} aria-hidden />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setConfirming(group.id);
                          }}
                          aria-label={`Delete ${group.name}`}
                          title="Delete"
                          className={tileActionClass}
                        >
                          <Trash2 size={18} aria-hidden />
                        </button>
                      </div>
                    ) : (
                      // The everyone row: canDeleteGroup refuses it, it has no
                      // chatToken, and it can never be claimed — so it has nothing
                      // any of the three icons act on.
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
                    {/* The claim state, which is a fact she reads. The invite URL
                        itself is no longer printed: it existed only to be
                        selected by hand, and it was never paste-able anyway — it
                        had no origin. The link icon copies an absolute one. */}
                    {group.email === null ? (
                      <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                        Invitation not used yet
                      </p>
                    ) : (
                      <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                        <span className="break-all">{group.email}</span>
                        {group.claimedAt !== null && (
                          <> · signed up {formatLongDate(group.claimedAt)}</>
                        )}
                      </p>
                    )}

                    {copyFallback?.id === group.id && (
                      <div className="mt-2 px-5">
                        <label className="block text-xs text-[var(--color-ink-muted)]">
                          Copy this link
                          <input
                            readOnly
                            value={copyFallback.url}
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                            className="mt-1 w-full rounded border border-[var(--card-line)] px-2 py-1 font-mono text-xs"
                          />
                        </label>
                      </div>
                    )}

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
            );
          })}
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
