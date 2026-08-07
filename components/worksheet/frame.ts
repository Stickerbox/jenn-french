import { SNAPSHOT_MESSAGE } from "@/lib/printable-bootstrap";

export const WORKSHEET_FRAME_ID = "worksheet-document";

// A silent failure here loses a student's homework, which is why this resolves
// null rather than throwing, and why every caller reports it. It INVERTS
// captureHtmlThumbnail's contract deliberately: a missing preview leaves a
// working iframe in place, and a missing snapshot leaves nothing.
const TIMEOUT_MS = 10_000;

export function worksheetFrame(): HTMLIFrameElement | null {
  const frame = document.getElementById(WORKSHEET_FRAME_ID);
  return frame instanceof HTMLIFrameElement ? frame : null;
}

// Asks the framed document for its serialised DOM. Lifted verbatim out of the
// old SaveVersionButton so the auto-saver and the Send button's flush share one
// copy rather than two that drift.
export function requestSnapshot(): Promise<string | null> {
  const frame = worksheetFrame();
  if (!frame?.contentWindow) return Promise.resolve(null);
  // Captured non-nullable: TS narrows at this line but does not carry the
  // narrowing into the closures below, which run later.
  const contentWindow = frame.contentWindow;

  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => finish(null), TIMEOUT_MS);

    function finish(value: string | null) {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    }

    function onMessage(event: MessageEvent) {
      // The frame is the only window that may answer, and it has an opaque
      // origin — so this checks the SOURCE, as the listener inside it does.
      if (event.source !== contentWindow) return;
      const data = event.data as
        | { type?: string; ok?: boolean; html?: string }
        | null;
      if (!data || data.type !== SNAPSHOT_MESSAGE) return;
      finish(data.ok && typeof data.html === "string" ? data.html : null);
    }

    window.addEventListener("message", onMessage);
    // "*" because the frame's origin is opaque — there is no origin string
    // that would match it. The listener authenticates us from the other side.
    contentWindow.postMessage(SNAPSHOT_MESSAGE, "*");
  });
}
