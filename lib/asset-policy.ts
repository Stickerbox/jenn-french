import { MAX_PAGE_BYTES } from "@/lib/page-html";

// What to fetch, and which content type to demand for it. This type lives here
// rather than beside the matcher because it is the key the fetch policy below is
// written against — putting it in lib/page-refs.ts would make these two modules
// import each other.
export type RefKind = "script" | "style" | "image" | "font";

const FONT_PATH = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i;

// A url() in CSS says nothing about what it points at, so the extension decides.
// Used by the octet-stream branch below as well as by the matcher.
export function assetKindForUrl(url: string): "image" | "font" {
  return FONT_PATH.test(url) ? "font" : "image";
}

// This list is the primary control on lib/asset-fetch.ts, and the reason it
// exists is worth stating plainly: the URLs that module fetches arrive in a
// request body, and the response is inlined into a document that is then public
// at /p/[slug]/raw. That is a read primitive. Without a list, whoever holds
// PAGES_UPLOAD_TOKEN could publish a page whose <script src> points at
// http://169.254.169.254/latest/meta-data/iam/security-credentials/ and read
// the box's S3 backup credentials straight out of it.
//
// Deliberately absent: esm.sh, cdn.skypack.dev, jspm.dev and every other module
// CDN. An ES module's `import` resolves against the module's own URL, so
// inlining one leaves its imports with nothing to resolve against — the ref
// would turn a page that is merely blocked into a page that is broken.
export const ASSET_HOSTS: readonly string[] = [
  "artifactcdn.diabrowser.engineering",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdn.tailwindcss.com",
  // The Google pair is listed together because either alone is useless: the
  // stylesheet without the fonts renders in a fallback face, and the fonts
  // without the stylesheet are unreachable.
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

// An asset larger than a whole page can never fit inside one. The cap is here
// to bound how much the process buffers, not to be a useful limit.
export const MAX_ASSET_BYTES = MAX_PAGE_BYTES;

// Phrased for a teacher, not a developer — these strings are shown to her
// verbatim by three different callers.
export const SKIP_REASONS = {
  notAllowed: "is not on the list of allowed sources",
  fetchFailed: "could not be fetched",
  wrongType: "was not the kind of file it claimed to be",
  tooBig: "would not fit inside the 2 MB page limit",
  relative: "is a file next to the page, and only the page itself is published",
  unsafe: "could not be inlined safely",
  tooDeep: "sits behind too many stylesheets to reach",
} as const;

export function isAllowedAssetUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  // An explicit port on a CDN is a sign of something other than the CDN.
  if (url.port !== "") return false;
  // https://cdnjs.cloudflare.com@evil.example/x has hostname evil.example.
  // Credentials in one of these URLs exist only to make a host look like
  // another one, which is why the check is on presence rather than content.
  if (url.username !== "" || url.password !== "") return false;

  // Exact, never a suffix: matching on `.jsdelivr.net` would admit every
  // subdomain anyone can register under it. URL.hostname is already
  // lowercased by the parser for ASCII hosts; the fold is belt and braces.
  return ASSET_HOSTS.includes(url.hostname.toLowerCase());
}

export function contentTypeMatches(
  kind: RefKind,
  contentType: string,
  url: string,
): boolean {
  const media = contentType.split(";")[0].trim().toLowerCase();

  if (kind === "script") {
    return media.includes("javascript") || media.includes("ecmascript");
  }
  if (kind === "style") return media === "text/css";
  if (kind === "image") return media.startsWith("image/");

  // Serving a font as octet-stream is a common CDN misconfiguration, so the
  // path extension stands in as the second signal. Narrow enough that an HTML
  // error page still cannot pass.
  return (
    media.startsWith("font/") ||
    media.startsWith("application/font") ||
    media === "application/vnd.ms-fontobject" ||
    (media === "application/octet-stream" && assetKindForUrl(url) === "font")
  );
}
