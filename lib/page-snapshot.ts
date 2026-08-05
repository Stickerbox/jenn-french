import { byteLength } from "@/lib/page-html";

// 3 MB, chosen the way MAX_PDF_BYTES and MAX_UPLOAD_BYTES were: the largest
// round number under the 4 MB client_max_body_size nginx was raised to BY HAND
// (docs/DEPLOYMENT.md item 11).
//
// It MUST exceed MAX_PAGE_BYTES. A snapshot is the worksheet plus what the
// student typed plus any canvas rasterised to a PNG data URL, so capping the
// two at one number would make a large worksheet unanswerable.
export const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024;

export type SnapshotResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

// validatePageHtml's sibling, with the same limited ambition: catch the wrong
// thing, do not attempt to parse the format. The messages are English because
// the only place they surface is a POST response the shell renders through its
// own French copy.
export function validateSnapshot(input: unknown): SnapshotResult {
  if (typeof input !== "string") {
    return { ok: false, error: "The snapshot is missing." };
  }

  const html = input.trim();
  if (!html) return { ok: false, error: "The snapshot is missing." };

  if (byteLength(html) > MAX_SNAPSHOT_BYTES) {
    return { ok: false, error: "That page is larger than 3 MB." };
  }

  if (!html.includes("<")) {
    return { ok: false, error: "That doesn't look like a document." };
  }

  return { ok: true, html };
}
