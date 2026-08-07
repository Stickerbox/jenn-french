import type { Colour, DrawOp, RemoveOp } from "@/lib/whiteboard-ops";

// The rungs a text block steps between. A ladder rather than free resizing,
// for the same reason the palette is five swatches and not a colour picker:
// bounded choices keep a board looking deliberate.
export const TEXT_SIZES = [28, 36, 44, 56, 72, 96] as const;

export type Revision = {
  dx?: number;
  dy?: number;
  colour?: Colour;
  text?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

// Every edit in the editor funnels through here. The log is append-only, so a
// revision is a retraction plus a replacement — the same mechanism the eraser
// uses, pointed at a different intent. foldPage needs no knowledge of it.
//
// The caller must move the selection to the returned op's id: a revised element
// is a NEW element as far as the log is concerned.
export function reviseOp(
  op: DrawOp,
  change: Revision,
  newId: string,
): [RemoveOp, DrawOp] {
  const dx = change.dx ?? 0;
  const dy = change.dy ?? 0;
  const colour = change.colour ?? op.colour;

  const remove: RemoveOp = {
    // Derived from newId rather than minted separately, so a caller cannot
    // accidentally pass the same id twice and produce a self-erasing pair.
    id: `remove-${newId}`,
    page: op.page,
    kind: "remove",
    targets: [op.id],
  };

  if (op.kind === "text") {
    return [
      remove,
      {
        ...op,
        id: newId,
        x: op.x + dx,
        y: op.y + dy,
        colour,
        text: change.text ?? op.text,
        size: change.size ?? op.size,
        // `??`, not `||` — a deliberate toggle to false must survive. `||`
        // would read a false change as "not given" and fall back to the old
        // value, so unbolding a bold element would do nothing.
        bold: change.bold ?? op.bold,
        italic: change.italic ?? op.italic,
        underline: change.underline ?? op.underline,
      },
    ];
  }

  if (op.kind === "arrow") {
    return [
      remove,
      {
        ...op,
        id: newId,
        x1: op.x1 + dx,
        y1: op.y1 + dy,
        x2: op.x2 + dx,
        y2: op.y2 + dy,
        colour,
      },
    ];
  }

  return [
    remove,
    {
      ...op,
      id: newId,
      // Flat [x, y, x, y, …], so even indices are x and odd are y.
      points: op.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
      colour,
    },
  ];
}

export function stepTextSize(size: number, direction: 1 | -1): number {
  // Snap first: a size off the ladder has no next rung until it is on one.
  const nearest = TEXT_SIZES.reduce((best, rung) =>
    Math.abs(rung - size) < Math.abs(best - size) ? rung : best,
  );
  const index = TEXT_SIZES.indexOf(nearest);
  const next = index + direction;
  if (next < 0 || next >= TEXT_SIZES.length) return nearest;
  return TEXT_SIZES[next];
}
