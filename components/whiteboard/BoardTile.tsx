"use client";

import { useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/whiteboard-ops";
import { downloadBoardJpeg } from "@/components/whiteboard/board-download";

export function BoardTile({
  slug,
  id,
  label,
  thumbnail,
  pageCount,
  onDelete,
}: {
  slug: string;
  id: string;
  label: string;
  thumbnail: string;
  pageCount: number;
  onDelete?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

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
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL has
          nothing for next/image to optimise, and it is already tiny. */}
      <img
        src={thumbnail}
        alt={label}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
        className="block w-full bg-[var(--card-paper-back)]"
      />
      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-line)] px-3 py-2">
        <div className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]">
          <div>{label}</div>
          <div className="text-[var(--card-moss)]">
            {pageCount === 1 ? "1 page" : `${pageCount} pages`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {error && <span className="text-xs text-[var(--card-rouge)]">Échec</span>}
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm disabled:opacity-50"
          >
            {busy ? "…" : "Télécharger"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="rounded-full border border-[var(--card-line)] px-3 py-1 text-sm text-[var(--card-rouge)]"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
