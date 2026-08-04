// 3 MB, and the number is not arbitrary. nginx's client_max_body_size on the
// server is 4m (docs/DEPLOYMENT.md item 11) and next.config.ts caps a server
// action at 4mb; 3 MB is the largest round number that still leaves room for
// the title, the group ids and multipart overhead. Raising this means an SSH
// session and an nginx reload, and until someone does it the failure is a raw
// 413 that Next never sees and the app cannot explain.
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

const HEADER = "%PDF-";

export type PagePdfResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

export function validatePagePdf(bytes: Uint8Array): PagePdfResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "The PDF is missing." };
  }

  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, error: "That PDF is larger than 3 MB." };
  }

  // The same ambition as validatePageHtml's `includes("<")`: catch the wrong
  // file, do not attempt to parse the format. Anchored at byte 0 even though
  // readers tolerate a header further in — a file that needs that tolerance is
  // worth reporting to the teacher rather than serving to a student.
  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, HEADER.length));
  if (prefix !== HEADER) {
    return { ok: false, error: "That doesn't look like a PDF." };
  }

  return { ok: true, bytes };
}
