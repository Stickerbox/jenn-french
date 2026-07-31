"use client";

import { useEffect, useRef } from "react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type DrawOp,
} from "@/lib/whiteboard-ops";

// Drawing is factored out of the component so the export can call it against
// an offscreen canvas at a different scale. Ops are in the fixed 1600x1000
// logical space, so every caller sets its own transform and then draws
// identically — which is the whole reason that space is fixed.
export function drawOps(
  context: CanvasRenderingContext2D,
  ops: DrawOp[],
): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const op of ops) {
    context.strokeStyle = op.colour;
    context.fillStyle = op.colour;

    if (op.kind === "stroke") {
      if (op.points.length < 4) {
        // A single point is a dot, which a zero-length path would not paint.
        context.beginPath();
        context.arc(op.points[0], op.points[1], op.width / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.lineWidth = op.width;
      context.beginPath();
      context.moveTo(op.points[0], op.points[1]);
      for (let i = 2; i < op.points.length; i += 2) {
        context.lineTo(op.points[i], op.points[i + 1]);
      }
      context.stroke();
      continue;
    }

    if (op.kind === "arrow") {
      const head = 18;
      const angle = Math.atan2(op.y2 - op.y1, op.x2 - op.x1);
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(op.x1, op.y1);
      context.lineTo(op.x2, op.y2);
      context.stroke();
      context.beginPath();
      context.moveTo(op.x2, op.y2);
      context.lineTo(
        op.x2 - head * Math.cos(angle - Math.PI / 7),
        op.y2 - head * Math.sin(angle - Math.PI / 7),
      );
      context.lineTo(
        op.x2 - head * Math.cos(angle + Math.PI / 7),
        op.y2 - head * Math.sin(angle + Math.PI / 7),
      );
      context.closePath();
      context.fill();
      continue;
    }

    // Georgia to match the flashcard's serif, since the board sits beside one.
    context.font = `${op.size}px Georgia, "Times New Roman", serif`;
    context.textBaseline = "top";
    op.text.split("\n").forEach((line, index) => {
      context.fillText(line, op.x, op.y + index * op.size * 1.25);
    });
  }
}

// --card-paper-back, as a literal for the same reason the palette is: a canvas
// cannot resolve a CSS custom property.
export const BOARD_PAPER = "#fdfaf3";

export function BoardCanvas({
  ops,
  className,
  // null leaves the canvas transparent. The editor stacks a second BoardCanvas
  // over the first to show the stroke in progress, and an opaque fill would
  // hide everything already drawn underneath it.
  background = BOARD_PAPER,
}: {
  ops: DrawOp[];
  className?: string;
  background?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    }
    drawOps(context, ops);
  }, [ops, background]);

  return (
    <canvas
      ref={ref}
      // The backing store is the logical space; CSS scales it to fit. That is
      // what lets the same ops render in the editor and in a thumbnail.
      width={BOARD_WIDTH}
      height={BOARD_HEIGHT}
      className={className}
    />
  );
}
