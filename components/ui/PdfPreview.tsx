import { BrandGlyph } from "@/components/ui/BrandGlyph";
import { formatFileSize } from "@/lib/file-size";
import { cn } from "@/lib/utils";

// The third renderer for PageTile's `preview` slot, and the second one to cash
// in the decision to make that slot a ReactNode. It is LinkPreview's shape: the
// PDF glyph that has existed since links could be PDFs, over a caption where
// the link's is its host.
//
// A rendered first page would be a better thumbnail. It would also need pdf.js
// running a dozen times on one shelf, which is the trade the preview frames
// already refuse.
export function PdfPreview({
  size,
  className,
}: {
  size: number | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[var(--card-paper-back)]",
        className,
      )}
    >
      <BrandGlyph brand="pdf" />
      {size !== null && (
        <span className="font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-[1px] text-[var(--card-moss)]">
          {formatFileSize(size)}
        </span>
      )}
    </div>
  );
}
