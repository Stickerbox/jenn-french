"use client";

import { useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { downloadBoardJpeg } from "@/components/whiteboard/board-download";
import { BoardViewer } from "@/components/whiteboard/BoardViewer";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

export function BoardTile({
  slug,
  id,
  label,
  thumbnail,
  pageCount,
  locale,
  onDelete,
}: {
  slug: string;
  id: string;
  label: string;
  thumbnail: string;
  pageCount: number;
  locale: Locale;
  onDelete?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const strings = getStrings(locale).student.board;

  async function download() {
    setBusy(true);
    setError(false);
    try {
      await downloadBoardJpeg({ slug, id, label });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--card-line)] bg-[var(--card-paper)]">
      {/* The picture is the control. A tile whose thumbnail does nothing while
          a small button beside it does everything is a tile that has to be
          read before it can be used. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={strings.viewer.open(label)}
        className={cn("block w-full", cardFocusRing)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL has
            nothing for next/image to optimise, and it is already tiny. */}
        <img
          src={thumbnail}
          alt=""
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          className="block w-full bg-[var(--card-paper-back)]"
        />
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-line)] px-3 py-2">
        <div className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]">
          <div>{label}</div>
          <div className="text-[var(--card-moss)]">
            {strings.pageCount(pageCount)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {error && (
            <span className="text-xs text-[var(--card-rouge)]">
              {strings.downloadFailed}
            </span>
          )}
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? "…" : strings.download}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm text-[var(--card-rouge)]"
            >
              {strings.delete}
            </button>
          )}
        </div>
      </div>
      {open && (
        <BoardViewer
          slug={slug}
          id={id}
          label={label}
          locale={locale}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
