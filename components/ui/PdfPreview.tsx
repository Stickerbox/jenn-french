import { BrandGlyph } from "@/components/ui/BrandGlyph";
import { formatFileSize } from "@/lib/file-size";
import { cn } from "@/lib/utils";

// The third renderer for PageTile's `preview` slot, and the second one to cash
// in the decision to make that slot a ReactNode. It is LinkPreview's shape.
//
// It draws a picture of page 1 when there is one, and falls back to the glyph
// over a file size when there is not — which is every PDF uploaded before
// thumbnails existed, deliberately: there is no backfill, because a script for
// one would need the server-side renderer this project refuses.
//
// The earlier note here said a rendered first page "would also need pdf.js
// running a dozen times on one shelf, which is the trade the preview frames
// already refuse". That trade is still refused. pdf.js never loads here: it runs
// once, in the admin, in Jenn's browser, at upload time, and the shelf receives
// a JPEG through an <img>.
export function PdfPreview({
  slug,
  size,
  thumbVersion,
  className,
}: {
  slug: string;
  size: number | null;
  // thumbAt as epoch milliseconds, or null when there is no stored preview.
  // A cache-busting version and an existence signal at once, which is why that
  // column is a timestamp rather than a boolean.
  thumbVersion: number | null;
  className?: string;
}) {
  if (thumbVersion !== null) {
    return (
      <div
        className={cn("relative aspect-[4/3] overflow-hidden bg-white", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a route serving
            a stored blob is not something next/image can optimise, and the tile
            has already decided its own box. */}
        <img
          // ?v= is not decoration. The route answers `immutable` for a year, so
          // this parameter is the ONLY thing that lets a replaced document's
          // picture be replaced. See app/p/[slug]/thumb/route.ts.
          src={`/p/${slug}/thumb?v=${thumbVersion}`}
          // object-cover object-top, not contain: a Letter page is portrait and
          // this box is 4:3, so contain would letterbox it into a stripe between
          // two grey bars. The top of a worksheet is its title and first lines —
          // the part that identifies it, which is the only thing a preview is
          // for — and HtmlPreview fills and clips for the same reason.
          className="h-full w-full object-cover object-top"
          // Decorative, exactly as HtmlPreview argues: the tile's title link is
          // its accessible name, so a screen reader walking a shelf hears eight
          // titles rather than eight documents.
          alt=""
          aria-hidden
          // What makes a dozen tiles cost only the visible ones.
          loading="lazy"
        />
      </div>
    );
  }

  // The file size belongs to this branch only. There is no room for both, the
  // picture is the better cue, and the size is still shown in the admin
  // editor's drop zone, where it is a fact about an upload rather than
  // decoration.
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
