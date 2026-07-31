"use client";

import { useRef, useState } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  dropTrailingEmptyPages,
  foldOps,
  type Colour,
  type Op,
} from "@/lib/whiteboard-ops";
import {
  BOARD_PAPER,
  BoardCanvas,
  drawOps,
} from "@/components/whiteboard/BoardCanvas";

type Tool = "pen" | "text" | "arrow" | "eraser";

const THUMBNAIL_WIDTH = 320;

let counter = 0;
// crypto.randomUUID is fine here, but a short monotonic id keeps the payload
// small and these only need to be unique within one board.
const nextId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

export function BoardEditor({
  slug,
  onSaved,
  onCancel,
}: {
  slug: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [ops, setOps] = useState<Op[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [colour, setColour] = useState<Colour>(PALETTE[0]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surface = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<number[] | null>(null);
  const [preview, setPreview] = useState<number[] | null>(null);

  const scene = foldOps(ops);
  const visible = scene[page] ?? [];

  // Pointer coordinates are in CSS pixels; ops are in the logical space. This
  // is the only place the two meet.
  function toLogical(event: React.PointerEvent): [number, number] {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      ((event.clientX - box.left) / box.width) * BOARD_WIDTH,
      ((event.clientY - box.top) / box.height) * BOARD_HEIGHT,
    ];
  }

  function append(op: Op) {
    setOps((current) => [...current, op]);
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = toLogical(event);

    if (tool === "text") {
      // A prompt() rather than an in-canvas editable text box. Deliberate
      // minimalism for Part 1: an inline editor means caret handling, IME
      // support and a second focus surface over a canvas, and none of that is
      // needed to find out whether the whiteboard earns its place here.
      const text = window.prompt("Texte :");
      if (text && text.trim().length > 0) {
        append({ id: nextId(), page, kind: "text", x, y, text, colour, size: 44 });
      }
      return;
    }

    if (tool === "eraser") {
      // Nearest op within a generous radius, so a trackpad click does not have
      // to be precise. Erase appends a remove; it never edits the log.
      const target = nearestOp(visible, x, y);
      if (target) {
        append({ id: nextId(), page, kind: "remove", targets: [target] });
      }
      return;
    }

    drawing.current = [x, y];
    setPreview([x, y]);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drawing.current) return;
    const [x, y] = toLogical(event);

    if (tool === "arrow") {
      // An arrow is two points, so the preview replaces rather than extends.
      setPreview([drawing.current[0], drawing.current[1], x, y]);
      return;
    }

    drawing.current.push(x, y);
    setPreview([...drawing.current]);
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!drawing.current) return;
    const [x, y] = toLogical(event);
    const started = drawing.current;
    drawing.current = null;
    setPreview(null);

    if (tool === "arrow") {
      append({
        id: nextId(),
        page,
        kind: "arrow",
        x1: started[0],
        y1: started[1],
        x2: x,
        y2: y,
        colour,
      });
      return;
    }

    append({
      id: nextId(),
      page,
      kind: "stroke",
      points: [...started, x, y],
      colour,
      width: 5,
    });
  }

  function undo() {
    setOps((current) => current.slice(0, -1));
  }

  function clearPage() {
    const targets = visible.map((op) => op.id);
    if (targets.length === 0) return;
    append({ id: nextId(), page, kind: "remove", targets });
  }

  function addPage() {
    setPageCount((count) => count + 1);
    setPage(pageCount);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const kept = dropTrailingEmptyPages(foldOps(ops));
      if (kept.every((p) => p.length === 0)) {
        setError("Le tableau est vide.");
        setSaving(false);
        return;
      }

      const response = await fetch(`/api/whiteboard/${slug}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops, thumbnail: renderThumbnail(kept[0]) }),
      });
      if (!response.ok) throw new Error("save failed");
      onSaved();
    } catch {
      // The log is still in state, so she can press Terminé again rather than
      // losing the board.
      setError("Échec de l'enregistrement. Réessayez.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["pen", "text", "arrow", "eraser"] as Tool[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTool(option)}
            aria-pressed={tool === option}
            className={`rounded-full border border-[var(--card-line)] px-4 py-2 font-[family-name:var(--card-font-serif)] text-sm ${
              tool === option
                ? "bg-[var(--card-bleu)] text-white"
                : "bg-[var(--card-paper)] text-[var(--card-moss)]"
            }`}
          >
            {{ pen: "Crayon", text: "Texte", arrow: "Flèche", eraser: "Gomme" }[option]}
          </button>
        ))}

        <span className="mx-1 flex gap-1">
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              onClick={() => setColour(swatch)}
              aria-label={swatch}
              aria-pressed={colour === swatch}
              style={{ background: swatch }}
              className={`h-8 w-8 rounded-full ${
                colour === swatch ? "ring-2 ring-offset-2 ring-[var(--card-ink)]" : ""
              }`}
            />
          ))}
        </span>

        <button type="button" onClick={undo} className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 text-sm">
          Annuler la dernière
        </button>
        <button type="button" onClick={clearPage} className="rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-4 py-2 text-sm">
          Effacer la page
        </button>
      </div>

      <div
        ref={surface}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // Without this a drag on a touch screen scrolls the page instead of
        // drawing, and the stroke is lost.
        style={{ touchAction: "none", aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
        className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--card-line)] bg-[var(--card-paper-back)]"
      >
        <BoardCanvas ops={visible} className="absolute inset-0 h-full w-full" />
        {preview && (
          <BoardCanvas
            className="absolute inset-0 h-full w-full"
            // Transparent, or this overlay would hide the committed ops below.
            background={null}
            ops={[
              tool === "arrow" && preview.length === 4
                ? {
                    id: "preview",
                    page,
                    kind: "arrow",
                    x1: preview[0],
                    y1: preview[1],
                    x2: preview[2],
                    y2: preview[3],
                    colour,
                  }
                : {
                    id: "preview",
                    page,
                    kind: "stroke",
                    points: preview,
                    colour,
                    width: 5,
                  },
            ]}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            Page {page + 1} / {pageCount}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1} className="rounded-full border border-[var(--card-line)] px-3 py-1 disabled:opacity-40">
            ›
          </button>
          <button type="button" onClick={addPage} className="rounded-full border border-[var(--card-line)] px-3 py-1">
            + Page
          </button>
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-[var(--card-rouge)]">{error}</span>}
          <button type="button" onClick={onCancel} className="rounded-full border border-[var(--card-line)] px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="button" onClick={save} disabled={saving} className="rounded-full bg-[var(--card-bleu)] px-5 py-2 text-sm text-white disabled:opacity-50">
            {saving ? "Enregistrement…" : "Terminé"}
          </button>
        </div>
      </div>
    </div>
  );
}

function nearestOp(
  ops: ReturnType<typeof foldOps>[number],
  x: number,
  y: number,
): string | null {
  let best: string | null = null;
  let bestDistance = 60; // logical units — a forgiving radius for a trackpad

  for (const op of ops) {
    const points: [number, number][] =
      op.kind === "stroke"
        ? Array.from({ length: op.points.length / 2 }, (_, i) => [
            op.points[i * 2],
            op.points[i * 2 + 1],
          ])
        : op.kind === "arrow"
          ? [
              [op.x1, op.y1],
              [op.x2, op.y2],
            ]
          : [[op.x, op.y]];

    for (const [px, py] of points) {
      const distance = Math.hypot(px - x, py - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = op.id;
      }
    }
  }

  return best;
}

// Page 1 at a small size. Rendered here because there is no server-side canvas
// and adding one would mean a native dependency; the route validates what
// arrives.
function renderThumbnail(ops: ReturnType<typeof foldOps>[number]): string {
  const scale = THUMBNAIL_WIDTH / BOARD_WIDTH;
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = Math.round(BOARD_HEIGHT * scale);

  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = BOARD_PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  drawOps(context, ops);

  // JPEG rather than PNG, and 0.7 rather than lossless: this is a 320px preview
  // stored in SQLite for every board, and the route caps it at 64k characters.
  return canvas.toDataURL("image/jpeg", 0.7);
}
