import { cn } from "@/lib/utils";

// A live thumbnail: the real page, framed oversized and scaled down.
//
// The frame is sized as a PERCENTAGE of the tile and scaled by a fixed factor,
// rather than sized in pixels and scaled by a computed one. The obvious
// formulation — a 900px frame at `scale(calc(100cqw / 900))` — is invalid CSS:
// a length divided by a number is a length, and scale() takes a unitless
// number, so the browser drops the rule. 500% at 0.2 needs no arithmetic and
// works at every column width with no measurement and no ResizeObserver.
//
// So the frame lays out at five times the tile's width — roughly 700-1200px in
// practice — and that range is the point. An iframe sized TO the tile (160px on
// a phone) would make the page lay itself out in its OWN mobile breakpoint, and
// the thumbnail would show a layout that opening the page never produces.
//
// The 4:3 box and the 5x/0.2 pair agree: the frame's height is 500% of a box
// three-quarters as tall as it is wide, so the scaled frame fills the box
// exactly — no letterbox, no overflow.
export function HtmlPreview({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative aspect-[4/3] overflow-hidden bg-white", className)}
    >
      <iframe
        src={`/p/${slug}/raw`}
        // sandbox="" — NOT `allow-scripts`, unlike the frame on /p/[slug].
        // A shelf mounts a dozen documents at once; their scripts would all
        // run, and an animation or an autoplaying <audio> inside a 160px
        // thumbnail has no control surface to stop it. This is strictly
        // stronger than /p/[slug]'s sandbox, so it adds no exposure — and the
        // raw route's `frame-ancestors 'self'` already permits framing here.
        // The cost is that a page drawn entirely by JavaScript previews blank.
        // That is not detectable from out here: the frame has an opaque origin,
        // so there is nothing to read back and no fallback to trigger.
        sandbox=""
        loading="lazy"
        // Decorative. The tile's title link is its accessible name, so a screen
        // reader walking a shelf hears eight titles, not eight documents.
        aria-hidden
        inert
        tabIndex={-1}
        // The tap belongs to the tile's stretched link, not to the page inside.
        className="pointer-events-none absolute left-0 top-0 h-[500%] w-[500%] origin-top-left scale-[0.2] border-0"
      />
    </div>
  );
}
