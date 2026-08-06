"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Link2, Trash2 } from "lucide-react";
import { Tile } from "@/components/ui/Tile";
import { SearchField } from "@/components/admin/SearchField";
import { filterGroups } from "@/lib/admin-search";
import { canDeleteGroup } from "@/lib/everyone";
import { formatLongDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
import { cardFieldSkin, tileActionClass } from "@/components/card-styles";
import { cn } from "@/lib/utils";

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
  locale,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
  onReset: (groupId: string) => Promise<void>;
  // This is a client component reached directly from app/admin/page.tsx, so
  // it takes `locale` rather than the resolved `strings` object — a
  // `Strings` value holds functions and cannot cross that boundary. See
  // lib/strings.ts.
  locale: Locale;
}) {
  const strings = getStrings(locale);
  const labels = strings.admin.groups;
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
      setError(err instanceof Error ? err.message : labels.couldNotDelete);
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
      setError(err instanceof Error ? err.message : labels.couldNotReset);
    } finally {
      setResetting(null);
    }
  }

  if (groups.length === 0) {
    return (
      <p className="mb-8 text-center text-sm text-[var(--color-ink-muted)]">
        {labels.noStudentsYet}
      </p>
    );
  }

  return (
    <div className="mb-10">
      <SearchField
        label={labels.searchLabel}
        value={query}
        onChange={setQuery}
        clearLabel={strings.common.clear}
      />

      {visible.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-ink-muted)]">
          {strings.admin.noMatches}
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
                    group.unread > 0 ? ` · ${labels.unreadCount(group.unread)}` : ""
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
                                ? labels.inviteCopiedAria(group.name)
                                : labels.copyInviteAria(group.name)
                            }
                            title={
                              copied === group.id
                                ? labels.copiedTitle
                                : labels.copyInviteTitle
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
                                ? labels.resetAria(group.name)
                                : labels.newInviteAria(group.name)
                            }
                            title={claimed ? labels.resetTitle : labels.newInviteTitle}
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
                          aria-label={labels.deleteAria(group.name)}
                          title={strings.common.delete}
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
                        {labels.everyoneLabel}
                      </span>
                    )
                  }
                />

                {confirming === group.id && (
                  <div className="mt-2 flex flex-wrap items-baseline justify-center gap-3 text-sm">
                    <span className="text-[var(--color-ink-muted)]">
                      {labels.deleteConfirm(group.name)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      disabled={deleting !== null}
                      className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                    >
                      {strings.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(group.id)}
                      disabled={deleting !== null}
                      className="font-medium text-[var(--card-rouge)] underline disabled:opacity-50"
                    >
                      {deleting === group.id ? strings.common.deleting : strings.common.delete}
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
                        {labels.invitationNotUsed}
                      </p>
                    ) : (
                      <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                        <span className="break-all">{group.email}</span>
                        {group.claimedAt !== null && (
                          <>{labels.signedUp(formatLongDate(group.claimedAt, locale))}</>
                        )}
                      </p>
                    )}

                    {copyFallback?.id === group.id && (
                      <div className="mt-2 px-5">
                        <label className="block text-xs text-[var(--color-ink-muted)]">
                          {labels.copyThisLink}
                          <input
                            readOnly
                            value={copyFallback.url}
                            autoFocus
                            onFocus={(event) => event.currentTarget.select()}
                            className={cn(
                              "mt-1 w-full rounded border px-2 py-1 font-mono text-xs",
                              cardFieldSkin,
                            )}
                          />
                        </label>
                      </div>
                    )}

                    {confirmingReset === group.id && (
                      <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm">
                        <span>
                          {group.email === null
                            ? labels.makeNewInviteConfirm(group.name)
                            : labels.resetSignInConfirm(group.name)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmingReset(null)}
                          disabled={resetting !== null}
                          className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                        >
                          {strings.common.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReset(group.id)}
                          disabled={resetting !== null}
                          className="font-medium text-[var(--card-rouge)] underline disabled:opacity-50"
                        >
                          {resetting === group.id ? labels.resetting : labels.reset}
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
        <p role="alert" className="mt-4 text-center text-sm text-[var(--card-rouge)]">
          {error}
        </p>
      )}
    </div>
  );
}
