"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoardEditor } from "@/components/whiteboard/BoardEditor";
import { BoardTile } from "@/components/whiteboard/BoardTile";
import { BoardCanvas } from "@/components/whiteboard/BoardCanvas";
import { useStream } from "@/components/StreamProvider";
import { foldPage } from "@/lib/whiteboard-ops";

export type BoardSummary = {
  id: string;
  label: string;
  thumbnail: string;
  pageCount: number;
};

export function BoardTab({
  slug,
  boards,
  isTeacher,
  onDelete,
}: {
  slug: string;
  boards: BoardSummary[];
  isTeacher: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [drawing, setDrawing] = useState(false);
  const router = useRouter();
  const { board } = useStream();

  if (drawing) {
    return (
      <BoardEditor
        slug={slug}
        onCancel={() => setDrawing(false)}
        onSaved={() => {
          setDrawing(false);
          // The archive is server-rendered, so a refresh is what makes the new
          // board appear rather than a local insert that could disagree with it.
          router.refresh();
        }}
      />
    );
  }

  // The student's live view. Above the archive rather than replacing it, so
  // switching to this tab mid-lesson does not hide the boards they already have.
  if (board && !isTeacher) {
    const page = [
      ...foldPage(board.ops).filter((op) => op.page === board.currentPage),
      // The stroke still under her cursor, drawn last so it sits on top. It is
      // not in the log and never will be — the committed version arrives on
      // pointerup and the server clears this in the same breath.
      ...(board.pending && board.pending.page === board.currentPage
        ? [board.pending]
        : []),
    ];
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <div
          style={{ aspectRatio: "1600 / 1000" }}
          className="w-full overflow-hidden rounded-xl border border-[var(--card-line)]"
        >
          <BoardCanvas ops={page} className="h-full w-full" />
        </div>
        <p className="mt-3 text-center font-[family-name:var(--card-font-serif)] text-sm italic text-[var(--card-moss)]">
          Page {board.currentPage + 1} — Jenn dessine…
        </p>
      </div>
    );
  }

  return (
    // Deliberately wider than the max-w-[560px] column every other tab lives
    // in: a flashcard is a narrow object and a whiteboard is the opposite.
    <div className="mx-auto w-full max-w-[1100px]">
      {isTeacher && (
        <div className="mb-6 flex justify-center">
          <button
            type="button"
            onClick={() => setDrawing(true)}
            className="rounded-full bg-[var(--card-bleu)] px-6 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity hover:opacity-90"
          >
            Nouveau tableau
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <p className="text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
          Aucun tableau pour l&apos;instant&nbsp;!
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <BoardTile
              key={board.id}
              slug={slug}
              id={board.id}
              label={board.label}
              thumbnail={board.thumbnail}
              pageCount={board.pageCount}
              onDelete={onDelete ? () => onDelete(board.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
