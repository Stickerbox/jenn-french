import { linkBrand, linkHostLabel } from "@/lib/link-brand";
import { BrandGlyph } from "@/components/ui/BrandGlyph";
import { cn } from "@/lib/utils";

// The link half of PageTile's `preview` slot, sitting beside HtmlPreview. The
// slot was left as a ReactNode for exactly this: a cross-origin URL generally
// cannot be framed at all, so this is a different renderer rather than
// HtmlPreview with another src.
//
// Nothing here makes a request. Not a favicon, not an og:image — no third party
// learns that a student opened their shelf.
export function LinkPreview({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const host = linkHostLabel(url);

  return (
    <div
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[var(--card-paper-back)]",
        className,
      )}
    >
      <BrandGlyph brand={linkBrand(url)} />
      {/* The host is the recognition cue when the glyph is the generic one, and
          it is the only place the destination is visible before clicking. */}
      {host && (
        <span className="max-w-[85%] truncate font-[family-name:var(--card-font-mono)] text-[10px] uppercase tracking-[1px] text-[var(--card-moss)]">
          {host}
        </span>
      )}
    </div>
  );
}
