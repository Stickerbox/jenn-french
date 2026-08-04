// The thumbnail half of a pdf page, beside lib/page-pdf.ts. Same shape as its
// neighbour — one convention per neighbourhood matters more than which
// convention — and the same limited ambition: a magic-byte check that catches
// the obvious slip, not an attempt to parse an image. There is no image
// sanitiser here for the reason there is no HTML one and no PDF one: the thing
// that contains a hostile file is the decoder it is opened in.
//
// Jenn's browser renders this file, so in the normal case it is ours. It still
// arrives in a FormData field over the network and ends up in an <img src> on a
// student's shelf, which makes it client-supplied data — the same reasoning
// lib/whiteboard-thumbnail.ts sets out for a value only the teacher can send.
//
// Unlike its neighbour's, these messages are never displayed: a rejected
// preview is dropped silently, because a bad thumbnail is not a failed upload
// (see readThumb in app/page-actions.ts). They are here so the shapes match and
// so a future caller that DOES want to report one has something to report.

// A bound, not a target: a 320px JPEG of a page of text is 15-40 KB.
//
// The number is chosen against the ceiling rather than against the image.
// MAX_PDF_BYTES is 3 MB because that is the largest round number fitting inside
// the 4 MB client_max_body_size nginx was raised to BY HAND (docs/DEPLOYMENT.md
// item 11), with room for the title and the group ids. 3 MB + 128 KB + multipart
// overhead still clears it, which is what keeps this feature free of a server
// change — and raising this constant is as much an nginx question as raising
// that one.
export const MAX_THUMB_BYTES = 128 * 1024;

export type PageThumbResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

// Every JPEG opens with SOI (FF D8) followed by the next marker's leading FF.
const MAGIC = [0xff, 0xd8, 0xff];

export function validatePageThumb(bytes: Uint8Array): PageThumbResult {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "The preview is missing." };
  }

  if (bytes.byteLength > MAX_THUMB_BYTES) {
    return { ok: false, error: "That preview is larger than 128 KB." };
  }

  if (bytes.byteLength < MAGIC.length) {
    return { ok: false, error: "That doesn't look like a JPEG." };
  }

  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      return { ok: false, error: "That doesn't look like a JPEG." };
    }
  }

  return { ok: true, bytes };
}
