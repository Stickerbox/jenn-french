"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  // Imported by name, not reached through a `React.` namespace: the new JSX
  // transform does not put `React` in scope, so `React.PointerEvent` in the
  // handler signatures below would not compile.
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BOARD_HEIGHT, BOARD_WIDTH, type DrawOp } from "@/lib/whiteboard-ops";
import { BOARD_PAPER, drawOps } from "@/components/whiteboard/BoardCanvas";
import { downloadBoardJpeg } from "@/components/whiteboard/board-download";
import { useOverlayLock } from "@/components/ui/OverlayProvider";
import {
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  clampScale,
  fitScale,
  rasterScale,
  type Offset,
  type Size,
} from "@/lib/board-zoom";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing } from "@/components/card-styles";
import { cn } from "@/lib/utils";

// One press of a zoom button, and one wheel notch.
const ZOOM_STEP = 1.5;

const BOARD: Size = { width: BOARD_WIDTH, height: BOARD_HEIGHT };

const controlClass = cn(
  "flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--card-line)] bg-[var(--card-paper)] px-3 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)] shadow-[var(--card-shadow)] transition-colors duration-150 hover:bg-[var(--card-section)] disabled:opacity-40 motion-reduce:transition-none",
  cardFocusRing,
);

// A saved board, readable in place.
//
// IT REDRAWS THE OPS. It does not magnify a picture, and that is the whole
// reason it exists rather than an <img> around the download's output: a board
// is vector ops in a 1600x1000 logical space, and exportLayout already
// downscales a long one to clear iOS Safari's canvas limit. Zooming into that
// image would show the downscale. Zooming here re-rasterises, so the strokes
// get sharper.
//
// It reads GET /api/whiteboard/[slug]/[id], which is unchanged: that route
// already authorises both parties through chatRole, and it already answers
// `private, max-age=3600`, which is safe because a saved board is immutable.
export function BoardViewer({
  slug,
  id,
  label,
  locale,
  onClose,
}: {
  slug: string;
  id: string;
  label: string;
  // A client component takes the LOCALE, never a resolved Strings object: that
  // object holds functions and React cannot serialize a function across the
  // server/client boundary. See lib/strings.ts.
  locale: Locale;
  onClose: () => void;
}) {
  const strings = getStrings(locale).student.board;
  const labels = strings.viewer;

  // Hides the two fixed corner buttons below `md` for the life of this mount,
  // the same rule AddSheet and ChatPanel follow. Without it the shelf's + and
  // the chat bubble paint over the zoom controls on a phone.
  useOverlayLock();

  const [pages, setPages] = useState<DrawOp[][] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Every pointer currently down on the frame, so one finger pans and two
  // pinch. A Map rather than two nullable refs: the second pointer can lift
  // first, and a pair of refs gets that wrong.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: Offset } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/whiteboard/${slug}/${id}`)
      .then((response) => {
        if (!response.ok) throw new Error("fetch failed");
        return response.json() as Promise<{ pages: DrawOp[][] }>;
      })
      .then((body) => {
        if (!cancelled) setPages(body.pages);
      })
      .catch(() => {
        // Every fetch rejection is handled. An unhandled one here would leave
        // the viewer on its loading state for ever with nothing to press.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Measured rather than assumed: the fit depends on the window, and the
  // window rotates.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setViewport({ width: box.width, height: box.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // fitScale falls back to 1 for a {0,0} size, which is what `viewport` is
  // before the ResizeObserver above has fired once — without this, the frame
  // between mount and that first measurement draws the canvas at the full
  // 1600x1000 logical size instead of nothing.
  const measured = viewport.width > 0 && viewport.height > 0;
  const fit = fitScale(viewport, BOARD);
  const drawnWidth = BOARD_WIDTH * fit * scale;
  const drawnHeight = BOARD_HEIGHT * fit * scale;

  // Clamped on EVERY render, not only inside the drag handler. The viewport
  // changes on rotate and on resize, and an offset that was legal before the
  // rotation can be off screen after it.
  const placed = clampPan(
    offset,
    viewport,
    { width: drawnWidth, height: drawnHeight },
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pages || !measured) return;

    const raster = rasterScale(
      { width: drawnWidth, height: drawnHeight },
      window.devicePixelRatio,
    );
    // Floored for the reason exportLayout floors its own: rounding both up
    // puts their product back over the cap that was just enforced. Never
    // below 1, because a canvas of zero pixels throws.
    const width = Math.max(1, Math.floor(drawnWidth * raster));
    const height = Math.max(1, Math.floor(drawnHeight * raster));
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    // The ops are in the logical space, so the transform is what turns this
    // into a redraw at the current zoom rather than a scaled bitmap.
    context.setTransform(width / BOARD_WIDTH, 0, 0, height / BOARD_HEIGHT, 0, 0);
    context.fillStyle = BOARD_PAPER;
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    drawOps(context, pages[page] ?? []);
  }, [pages, page, drawnWidth, drawnHeight, measured]);

  // Zooms about the middle of the viewport, so the thing being looked at stays
  // roughly where it was. Shared with the pinch gesture below, so a factor and
  // a measured finger-distance ratio can't disagree about the rule.
  //
  // Reads `placed`, not the raw `offset` state, and reads it from render scope
  // rather than through setOffset's functional updater. Two separate reasons:
  // calling setOffset inside a setScale updater is a side effect in an
  // updater, which React may run twice — and, the one that actually bit,
  // the updater's `current` is the UNCLAMPED offset, while what is on screen
  // and what needs to hold still is `placed`'s clamped one. Those diverge
  // whenever the board's 1.6:1 aspect doesn't match the viewport's, which is
  // almost always: using the raw offset made the zoom jump on whichever axis
  // clampPan was centring.
  const applyScale = useCallback(
    (next: number) => {
      const ratio = next / scale;
      setOffset({
        x: viewport.width / 2 - (viewport.width / 2 - placed.x) * ratio,
        y: viewport.height / 2 - (viewport.height / 2 - placed.y) * ratio,
      });
      setScale(next);
    },
    // setOffset and setScale are stable across renders, so listing them
    // changes nothing about when applyScale is rebuilt. They are named anyway
    // because the React Compiler infers them as dependencies here and, left
    // off, refuses to optimise the whole component rather than just this
    // callback.
    [scale, viewport.width, viewport.height, placed.x, placed.y, setOffset, setScale],
  );

  // One press of a zoom button, or one wheel notch, turned into a target
  // scale. The centring math itself lives in applyScale, above, so this and
  // the pinch branch in onPointerMove can't drift apart.
  const zoomBy = useCallback(
    (factor: number) => {
      const next = clampScale(scale * factor);
      if (next === scale) return;
      applyScale(next);
    },
    [scale, applyScale],
  );

  // A native listener with `{ passive: false }`, NOT an onWheel prop. React
  // attaches wheel at the root as passive, so preventDefault from a JSX
  // handler is ignored and logs an error — and without it the page behind
  // scrolls while the board zooms.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Distance between the first two pointers currently down, by insertion
  // order. `pinch.current` is always baselined against that same pair (see
  // syncGesture below), so this must keep reading it the same way or a
  // baseline and a live distance would silently drift apart.
  function pointerGap(): number {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Re-derives drag and pinch from the whole pointers map, rather than
  // reacting only to the transition that just changed it. Enumerated as one
  // small state machine because the transitions were getting two cases
  // wrong: lifting the first finger of a pinch dropped straight to "1 pointer
  // left" without ever arming a drag, freezing the remaining finger; and a
  // third finger landing, then one of the original two lifting, left the
  // pinch baselined against a pair that no longer matched who was touching
  // the glass. Re-deriving on every call fixes both, because it always
  // rebuilds from whichever pointers are actually down right now.
  //
  //   0 pointers: nothing is happening.
  //   1 pointer:  a pan, armed from that pointer and where the board is
  //               actually drawn — never a pinch.
  //   2+ pointers: a pinch, baselined from the first two by insertion order
  //               — never a pan.
  function syncGesture() {
    const active = [...pointers.current.entries()];

    if (active.length === 0) {
      drag.current = null;
      pinch.current = null;
      return;
    }

    if (active.length === 1) {
      const [id, point] = active[0];
      drag.current = {
        id,
        x: point.x,
        y: point.y,
        // From where it is DRAWN, not from the unclamped request — true
        // whether this pan is starting fresh or resuming after a pinch, or a
        // drag that starts after a clamp jumps by the difference.
        from: placed,
      };
      pinch.current = null;
      return;
    }

    pinch.current = { distance: pointerGap(), scale };
    drag.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    syncGesture();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinching = pinch.current;
    if (pinching && pointers.current.size >= 2) {
      const distance = pointerGap();
      // Guard the divide: two fingers can land on one point, and the NaN that
      // produces survives Math.min and Math.max all the way to the canvas.
      if (pinching.distance > 0) {
        applyScale(clampScale(pinching.scale * (distance / pinching.distance)));
      }
      return;
    }

    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    setOffset({
      x: active.from.x + (event.clientX - active.x),
      y: active.from.y + (event.clientY - active.y),
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    syncGesture();
  }

  async function download() {
    setBusy(true);
    setDownloadFailed(false);
    try {
      await downloadBoardJpeg({ slug, id, label });
    } catch {
      setDownloadFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const total = pages?.length ?? 0;

  return (
    // z-[60], above the z-50 corner buttons, the same layer AddSheet and
    // ChatPanel use.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--card-page-bg)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--card-line)] px-4 py-3">
        <button type="button" onClick={onClose} className={controlClass}>
          {labels.close}
        </button>

        <h2 className="truncate font-[family-name:var(--card-font-serif)] text-base font-semibold text-[var(--card-ink)]">
          {label}
        </h2>

        <div className="flex items-center gap-2">
          {downloadFailed && (
            <span className="text-xs text-[var(--card-rouge)]">
              {strings.downloadFailed}
            </span>
          )}
          <button
            type="button"
            onClick={() => void download()}
            disabled={busy}
            className={controlClass}
          >
            {busy ? "…" : strings.download}
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // touch-action: none, so the browser does not claim the gesture for
        // its own scroll before the handlers above see it.
        className="relative flex-1 touch-none overflow-hidden"
      >
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center font-[family-name:var(--card-font-serif)] italic text-[var(--card-moss)]">
            {labels.loadFailed}
          </p>
        ) : !measured ? null : (
          <canvas
            ref={canvasRef}
            aria-label={labels.position(page + 1, Math.max(total, 1))}
            role="img"
            style={{
              width: `${drawnWidth}px`,
              height: `${drawnHeight}px`,
              transform: `translate(${placed.x}px, ${placed.y}px)`,
            }}
            className="absolute left-0 top-0 origin-top-left"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--card-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                aria-label={labels.previous}
                className={controlClass}
              >
                ‹
              </button>
              <span className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
                {labels.position(page + 1, total)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(total - 1, current + 1))
                }
                disabled={page >= total - 1}
                aria-label={labels.next}
                className={controlClass}
              >
                ›
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label={labels.zoomOut}
            className={controlClass}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(MIN_SCALE);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label={labels.resetZoom}
            className={controlClass}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label={labels.zoomIn}
            className={controlClass}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
