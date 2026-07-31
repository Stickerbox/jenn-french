"use client";

import { useState } from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { exportLayout } from "@/lib/whiteboard-export";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";

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

  // One tall JPEG rather than one file per page: multiple programmatic
  // downloads make Chrome and Safari prompt, and a zip would mean the first
  // utility dependency in this project.
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/whiteboard/${slug}/${id}`);
      if (!response.ok) throw new Error("fetch failed");
      const { pages } = (await response.json()) as { pages: DrawOp[][] };

      const layout = exportLayout(pages.length);
      const canvas = document.createElement("canvas");
      canvas.width = layout.width;
      canvas.height = layout.height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context");

      context.fillStyle = BOARD_PAPER;
      context.fillRect(0, 0, canvas.width, canvas.height);

      pages.forEach((ops, index) => {
        context.save();
        context.translate(0, index * (layout.pageHeight + layout.gap));
        context.scale(layout.scale, layout.scale);
        context.beginPath();
        context.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        context.clip();
        drawOps(context, ops);
        context.restore();

        if (index > 0) {
          context.fillStyle = "#d8cbb4"; // --card-line
          context.fillRect(
            0,
            index * (layout.pageHeight + layout.gap) - layout.gap / 2,
            canvas.width,
            1,
          );
        }
      });

      const url = canvas.toDataURL("image/jpeg", 0.9);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tableau-${label.replace(/[^\w]+/g, "-").toLowerCase()}.jpg`;
      anchor.click();
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
