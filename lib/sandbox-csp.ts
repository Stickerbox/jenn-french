// The policy for a document we did not write, served into a sandboxed frame.
// Two routes serve one: /p/[slug]/raw (a page Jenn or a student published) and
// /g/[slug]/w/[pageSlug]/raw (a worksheet and its saved versions).
//
// It lives here rather than in each of them for the reason chatRole gives about
// itself: a rule duplicated across two files is a rule that will eventually
// differ in one of them, and the difference would be a hole rather than a bug
// report. That argument is stronger here than there — this one is a security
// boundary, and the divergence would be silent in both directions.
//
// Every directive is restricted to what the document carries inside itself —
// NO https: ANYWHERE. A subresource load is a real network request, so
// `img-src https:` alone would let a hostile page exfiltrate whatever a student
// typed via <img src="https://…?d=answer">. `connect-src 'none'` closes fetch,
// XHR and beacon but NOT subresource loads, which is why the passive directives
// have to be closed too.
//
// Residual, accepted and unclosable: a sandboxed frame may navigate itself, so
// `location.href = "https://…?d=…"` still leaks. No CSP directive prevents it
// (`navigate-to` was never shipped). The sandbox does block navigating the TOP
// window and opening popups.
//
// Consequence: a page that pulls a font, image, stylesheet or script from a CDN
// will not load it. Self-contained files are the only supported kind, which is
// what lib/page-inline.ts exists to produce.
//
// NOTHING IN THE WORKSHEET FEATURE IS A REASON TO WIDEN THIS. A saved version
// contains text a student typed, and a contenteditable region captures as real
// student-authored HTML — so a student can get markup into a document Jenn
// later opens, and stripping <script> at capture does not close that, since
// <img onerror> survives. It is contained by the argument already accepted for
// Jenn's uploads and for student-published pages: the frame has an opaque
// origin, so it can read no cookie, no storage and no teacher session, and no
// directive here admits a destination to exfiltrate to.
export const SANDBOXED_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");
