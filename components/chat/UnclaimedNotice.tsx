"use client";

import { useEffect, useState } from "react";

export type UnclaimedLabels = {
  notSignedUpLong: string;
  copyInvite: string;
  copied: string;
};

// Replaces MessageInput when the selected student has not claimed their
// account. Listed rather than hidden, and read-only rather than writable — see
// "What this retires §1a" in the 2026-08-04 chat inbox design.
export function UnclaimedNotice({
  groupId,
  name,
  labels,
  onInviteLink,
}: {
  groupId: string;
  name: string;
  labels: UnclaimedLabels;
  onInviteLink: (groupId: string) => Promise<string | null>;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetched on mount rather than shipped with the conversation list: this is
  // chatToken, a live credential, and the list renders on every teacher page.
  //
  // No synchronous reset of `link`/`copied` here, for two reasons that agree:
  // react-hooks/set-state-in-effect rejects it, and InboxFab keys this
  // component on groupId, so switching students remounts it with both already
  // at their initial values. The `cancelled` flag below is still needed — that
  // guards a response, not a render.
  useEffect(() => {
    let cancelled = false;
    void onInviteLink(groupId).then((value) => {
      // A response that arrives after she has moved to another student must not
      // paint that student's panel with this one's invite.
      if (!cancelled) setLink(value);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId, onInviteLink]);

  async function copy() {
    if (!link) return;
    // Absolute, because what she pastes into a message has to work away from
    // this tab. window is safe here — this only ever runs in an event handler.
    await navigator.clipboard.writeText(`${window.location.origin}${link}`);
    setCopied(true);
  }

  return (
    <div className="shrink-0 border-t border-[var(--color-field-border)] p-4">
      <p className="mb-2 text-sm text-[var(--color-ink-muted)]">
        {labels.notSignedUpLong.replace("{name}", name)}
      </p>

      {link && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--color-field)] px-2 py-1 text-xs text-[var(--color-ink)]">
            {link}
          </code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 text-xs text-[var(--color-ink-muted)] underline"
          >
            {copied ? labels.copied : labels.copyInvite}
          </button>
        </div>
      )}
    </div>
  );
}
