"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";

// Renders a PDF INSIDE this site, page by page, on a canvas per page — the
// alternative to framing it. CLAUDE.md's "A PDF is never framed" explains why
// framing is refused (iOS Safari renders only page 1 of a framed PDF,
// silently), and this is the cost of refusing it: pdf.js runs in the
// student's own browser instead. Impure — a DOM canvas, a web worker, an
// IntersectionObserver — and therefore NOT in lib/, the same split
// components/pdf-thumbnail.ts already draws for the same reason.

type PdfjsModule = typeof import("pdfjs-dist");
// Type-only references, erased at compile time — same trick
// components/pdf-thumbnail.ts uses for PdfjsModule itself. Neither line
// creates a runtime import of pdfjs-dist, which matters here more than there:
// a static import of the TYPE is free, but a static import of the MODULE
// would put a PDF renderer in a chunk every visitor downloads, defeating the
// dynamic import below.
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

// Two budgets, not one — the same split components/pdf-thumbnail.ts makes and
// for the same measured reason: pdf.js and its worker are most of a
// megabyte, so on weak LTE the download alone can spend a single shared
// budget and every page comes back blank even though the library would have
// rendered them fine once it arrived.
const LOAD_TIMEOUT_MS = 30_000;
// Per PAGE, not per document — a 40-page scan should not spend one clock on
// every page it holds, and a page stuck decoding must not block the pages
// around it forever.
const RENDER_TIMEOUT_MS = 10_000;

// iOS Safari returns a BLANK canvas past roughly 16.7M pixels rather than
// failing loudly (see lib/whiteboard-export.ts's MAX_CANVAS_AREA, which caps
// a different canvas — a whole stacked whiteboard export — against the same
// measured ceiling). This one caps a single rendered page; a little under the
// real limit for headroom.
const MAX_CANVAS_AREA = 16_000_000;
// 2 is already sharp. Multiplying by the real devicePixelRatio on a modern
// phone (3, sometimes more) would spend most of the pixel budget above on
// sharpness nobody asked for and nobody's eyes need.
const MAX_DEVICE_PIXEL_RATIO = 2;

// A couple at once, never all of them. The IntersectionObserver in PdfPage
// below only decides WHEN a page becomes a candidate to render; this caps how
// many candidates may actually be decoding at the same moment — rasterising a
// 40-page PDF in parallel on a phone is the exact thing lazy rendering below
// exists to avoid.
const MAX_CONCURRENT_RENDERS = 2;

// Roughly one screen, in both directions, so a page has usually finished
// rendering by the time scrolling reaches it rather than popping in. A fixed
// pixel value rather than a percentage: IntersectionObserver's percentage
// rootMargin has inconsistent Safari support, and this whole feature exists
// for an iOS-heavy audience.
const ROOT_MARGIN = "1000px 0px";

// Debounced, and only committed when the rounded width actually changed. A
// ResizeObserver fires on every fractional layout pass — a scrollbar
// appearing, a font swap — and redrawing every visible page on each of those
// would thrash for no visible difference.
const WIDTH_DEBOUNCE_MS = 200;

// US Letter, close enough at 72dpi. Only used for a page whose own metadata
// failed to load (see the settled.map below) — a placeholder needs SOME box
// before it can be told there isn't a real one.
const FALLBACK_ASPECT = { width: 850, height: 1100 };

// Dynamic, and this is the load-bearing line of the whole feature — copied
// from components/pdf-thumbnail.ts on purpose rather than re-derived, because
// the reasoning is identical: a static import would put a PDF renderer in a
// chunk the router could serve to every visitor, including the vast majority
// who never open a PDF at all.
async function loadPdfjs(): Promise<PdfjsModule> {
  const pdfjs = await import("pdfjs-dist");

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  return pdfjs;
}

// A couple of renders at once, first-come-first-served. Returned as a stable
// function (deps never change) so passing it down to every PdfPage does not
// itself cause a re-render.
function useRenderGate(maxConcurrent: number) {
  const activeRef = useRef(0);
  const queueRef = useRef<Array<() => void>>([]);

  return useCallback(
    (task: () => Promise<void>) => {
      const run = () => {
        activeRef.current += 1;
        task().finally(() => {
          activeRef.current -= 1;
          const next = queueRef.current.shift();
          if (next) next();
        });
      };
      if (activeRef.current < maxConcurrent) run();
      else queueRef.current.push(run);
    },
    [maxConcurrent],
  );
}

async function drawPage(
  proxy: PDFPageProxy,
  canvas: HTMLCanvasElement,
  containerWidth: number,
): Promise<void> {
  const unscaled = proxy.getViewport({ scale: 1 });
  const dpr = Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    MAX_DEVICE_PIXEL_RATIO,
  );
  let scale = (containerWidth / unscaled.width) * dpr;
  let viewport = proxy.getViewport({ scale });

  if (viewport.width * viewport.height > MAX_CANVAS_AREA) {
    // Shrink the RASTER, never the CSS box: the wrapper around this canvas
    // already reserved the page's real aspect ratio from its untouched
    // getViewport({scale:1}) dimensions, so downscaling here costs sharpness
    // on an unusually wide container or a high-DPR phone, never layout — the
    // same trade lib/whiteboard-export.ts makes against the same ceiling.
    scale *= Math.sqrt(MAX_CANVAS_AREA / (viewport.width * viewport.height));
    viewport = proxy.getViewport({ scale });
  }

  // Floor, not round: rounding both dimensions up can put their product back
  // over MAX_CANVAS_AREA — the exact failure the clamp above exists to
  // prevent, and lib/whiteboard-export.ts's exportLayout records the same
  // trap for its own canvas.
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");

  // White first. A PDF page carries no background of its own and an unpainted
  // canvas is transparent — the same fill, for the same reason,
  // components/pdf-thumbnail.ts uses before it renders.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // `canvas`, not `canvasContext` — pdf.js 6 deprecated the context form, the
  // same note components/pdf-thumbnail.ts records.
  await proxy.render({ canvas, viewport }).promise;
}

function PdfPage({
  proxy,
  naturalWidth,
  naturalHeight,
  containerWidth,
  schedule,
  ariaLabel,
}: {
  proxy: PDFPageProxy | null;
  naturalWidth: number;
  naturalHeight: number;
  containerWidth: number;
  schedule: (task: () => Promise<void>) => void;
  ariaLabel: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"pending" | "rendering" | "done" | "error">(
    proxy ? "pending" : "error",
  );
  // Two refs rather than state: neither needs to trigger a render on its own,
  // they only guard WHEN renderNow below is allowed to do something.
  const hasBeenVisibleRef = useRef(false);
  const renderedWidthRef = useRef<number | null>(null);
  // ONE RENDER AT A TIME PER CANVAS. pdf.js throws if two render() calls
  // share a canvas, and there are two ways to provoke that here: an
  // IntersectionObserver fires again every time a page scrolls out of the
  // margin and back, and a width change can arrive mid-render. Either would
  // reject the second call, flip this page to `error`, and hide a canvas that
  // had just drawn correctly — a blank page in the middle of a document that
  // otherwise worked.
  const renderingRef = useRef(false);
  // Always the newest renderNow, so the retry at the end of a successful
  // render sees the current width rather than the one its own closure
  // captured. Declared before the callback that reads it, which is what the
  // `react-hooks/immutability` rule asks for.
  const renderAgainRef = useRef<(() => void) | null>(null);

  const renderNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!proxy || !canvas || containerWidth <= 0) return;
    if (renderedWidthRef.current === containerWidth) return; // nothing to redo
    if (renderingRef.current) return;

    // Captured, not read from the closure afterwards: the width can change
    // while this awaits, and what was drawn is what must be recorded.
    const width = containerWidth;
    renderingRef.current = true;

    schedule(async () => {
      setStatus("rendering");
      try {
        await Promise.race([
          drawPage(proxy, canvas, width),
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error("pdf page render timed out")), RENDER_TIMEOUT_MS);
          }),
        ]);
        renderedWidthRef.current = width;
        setStatus("done");
        renderingRef.current = false;
        // A width that changed while this was drawing was turned away by the
        // guard above and nothing else would come back for it, so the page
        // would stay at the old width until it happened to be scrolled past
        // again. Asking once more here is a no-op when the width still
        // matches, and only ever runs after a SUCCESS — retrying a failure
        // would spin on a page that cannot render at all.
        renderAgainRef.current?.();
      } catch {
        setStatus("error");
        renderingRef.current = false;
      }
    });
  }, [proxy, containerWidth, schedule]);

  // Written in an effect, never during render — `react-hooks/refs` forbids
  // touching a ref while rendering.
  useEffect(() => {
    renderAgainRef.current = renderNow;
  }, [renderNow]);

  // Lazy: a page becomes a render candidate only once it nears the viewport,
  // never all at once. One observer per page rather than one shared observer
  // watching every wrapper, because this project has no existing shared
  // IntersectionObserver plumbing to reuse and a dozen observers on a
  // worksheet-length document is not the cost this file is guarding against —
  // rendering a dozen CANVASES at once is.
  useEffect(() => {
    if (!proxy) return;
    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            hasBeenVisibleRef.current = true;
            renderNow();
          }
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [proxy, renderNow]);

  // A container width change (orientation, resize) after this page had
  // already been seen redraws it at the new width. A page not yet visible
  // needs nothing here — it picks up whatever the current width is the first
  // time its own observer fires.
  useEffect(() => {
    if (hasBeenVisibleRef.current) renderNow();
  }, [containerWidth, renderNow]);

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label={ariaLabel}
      // The visible separator between pages, and the background a page not
      // yet rendered (or one whose own render failed) shows in its place —
      // both are the same box, since an unrendered page and a failed one look
      // identical to a reader and neither is a dead end on its own (see the
      // top-level failure state in PdfDocumentView for the one that is).
      className="relative w-full border-b border-[var(--card-line)] bg-[var(--card-paper-back)] last:border-b-0"
      style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}` }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className={
          status === "done" ? "block h-full w-full" : "hidden h-full w-full"
        }
      />
    </div>
  );
}

type PageMeta = {
  proxy: PDFPageProxy | null;
  width: number;
  height: number;
};

export function PdfDocumentView({
  src,
  fallbackHref,
  locale,
}: {
  // The URL pdf.js streams bytes from — one of this project's own raw pdf
  // routes (/p/[slug]/pdf or the worksheet mirror), never an external one.
  src: string;
  // Where the failure state's escape hatch points: the same raw route,
  // opened as a top-level navigation in the browser's own viewer. That route
  // is this component's fallback AND its byte source — see CLAUDE.md.
  fallbackHref: string;
  locale: Locale;
}) {
  const strings = getStrings(locale).pdfViewer;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageMeta, setPageMeta] = useState<PageMeta[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const taskRef = useRef<{ destroy: () => Promise<void> } | null>(null);
  const schedule = useRenderGate(MAX_CONCURRENT_RENDERS);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pdfjs = await Promise.race([
        loadPdfjs(),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), LOAD_TIMEOUT_MS);
        }),
      ]);
      if (cancelled) return;
      if (!pdfjs) {
        setStatus("error");
        return;
      }

      try {
        // Streamed by the worker rather than fetched into memory first — the
        // `url` form, not `data`, is what lets pdf.js request byte ranges of
        // a large document instead of downloading it whole before showing
        // anything.
        const task = pdfjs.getDocument({ url: src });
        taskRef.current = task;
        const doc: PDFDocumentProxy = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }

        // Same case components/pdf-thumbnail.ts refuses: a zero-page PDF has
        // nothing to show and no page for the loop below to iterate, which
        // would otherwise silently render an empty column rather than the
        // real failure state.
        if (doc.numPages < 1) throw new Error("pdf has no pages");

        // getViewport({scale:1}) on every page up front — cheap, no raster,
        // just the page's own declared size — so every placeholder can
        // reserve its real aspect ratio before the reader ever scrolls to it.
        // Promise.allSettled rather than Promise.all: one corrupt page inside
        // an otherwise fine document should not take the whole document down
        // with it.
        const settled = await Promise.allSettled(
          Array.from({ length: doc.numPages }, (_unused, i) =>
            doc.getPage(i + 1).then((page) => {
              const viewport = page.getViewport({ scale: 1 });
              return { proxy: page, width: viewport.width, height: viewport.height };
            }),
          ),
        );
        if (cancelled) return;

        setPageMeta(
          settled.map((result) =>
            result.status === "fulfilled"
              ? result.value
              : { proxy: null, width: FALLBACK_ASPECT.width, height: FALLBACK_ASPECT.height },
          ),
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
        // Nothing further will read from this task once the error state is
        // shown, so it is released here rather than left held until unmount —
        // a reader who opens a broken PDF and stays on the page should not
        // keep its worker resources alive for the rest of the visit. Cleared
        // afterwards so the cleanup below, which also calls destroy(), finds
        // nothing left to destroy a second time.
        void taskRef.current?.destroy();
        taskRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      // Held rather than discarded, and destroy()'d rather than cleanup()'d —
      // the same note components/pdf-thumbnail.ts records: in pdf.js 6 the
      // LOADING TASK owns destroy(), not the document proxy, which has only
      // cleanup() and would leave the worker's own copy of the file behind.
      void taskRef.current?.destroy();
    };
    // Re-runs only if the byte source itself changes (a different version
    // tab), which is the one case this whole effect should restart for.
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measured synchronously once, so the first page does not wait out a
    // debounce window before it knows how wide to render — only CHANGES
    // after this are debounced.
    setContainerWidth(Math.round(el.getBoundingClientRect().width));

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setContainerWidth((prev) => (prev === width ? prev : width));
      }, WIDTH_DEBOUNCE_MS);
    });
    observer.observe(el);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  if (status === "error") {
    // The total contract: loading state above, and on ANY failure — a
    // library fetch that timed out, an encrypted or corrupt PDF, a document
    // with no pages — this sentence and a real way out. fallbackHref is the
    // browser's own viewer, which is why this feature is allowed to exist at
    // all: nothing here can ever fully dead-end a reader.
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="max-w-xs font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--color-ink-muted)]">
          {strings.renderFailed}
        </p>
        <a
          href={fallbackHref}
          className="font-[family-name:var(--card-font-serif)] text-sm font-medium text-[var(--color-accent)] underline underline-offset-2"
        >
          {strings.openInBrowser}
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-3xl">
      {status === "loading" && (
        <p className="py-16 text-center font-[family-name:var(--card-font-serif)] text-sm text-[var(--color-ink-muted)]">
          {strings.loading}
        </p>
      )}
      {status === "ready" &&
        pageMeta.map((meta, i) => (
          <PdfPage
            // Index is stable here: pageMeta is built once from doc.numPages
            // and never reordered or filtered afterwards.
            key={i}
            proxy={meta.proxy}
            naturalWidth={meta.width}
            naturalHeight={meta.height}
            containerWidth={containerWidth}
            schedule={schedule}
            ariaLabel={strings.pageAria(i + 1)}
          />
        ))}
    </div>
  );
}
