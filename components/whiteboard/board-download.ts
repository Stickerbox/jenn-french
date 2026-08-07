import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { exportLayout } from "@/lib/whiteboard-export";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";

// ONE tall JPEG with every page stacked, not one file per page: multiple
// programmatic downloads make Chrome and Safari prompt, and a zip would be the
// first utility dependency in this project.
//
// Lifted out of BoardTile so the viewer's own download is the SAME file rather
// than a second implementation of it. Impure — it fetches, it builds a canvas
// and it clicks an anchor — so it sits in components/ rather than lib/, the
// same split components/pdf-thumbnail.ts already makes.
//
// It THROWS on failure rather than returning a flag. Both callers already hold
// their own error state and their own wording, and a boolean would make them
// invent the same branch twice.
export async function downloadBoardJpeg(input: {
  slug: string;
  id: string;
  label: string;
}): Promise<void> {
  const response = await fetch(`/api/whiteboard/${input.slug}/${input.id}`);
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
  anchor.download = `tableau-${input.label.replace(/[^\w]+/g, "-").toLowerCase()}.jpg`;
  anchor.click();
}
