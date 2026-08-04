// A relative ref inside a document and a key into an uploaded bundle are one
// string seen from two sides, and this is the only place either becomes the
// other. tools/publish-dia-artifact.sh deliberately does NOT normalise: it
// uploads refs verbatim and lets this function key both the bundle and the
// document's refs, so the two agree by construction rather than by two
// implementations of one rule staying in step.

// Null when a ref addresses nothing inside the bundle: it is empty, or it climbs
// above the root. Callers report that; they never guess a substitute.
export function normaliseAssetPath(ref: string): string | null {
  // Fragment first, then query: a `?` appearing after a `#` is part of the
  // fragment, not a query string.
  const path = ref.split("#")[0].split("?")[0];

  // Split BEFORE decoding. Decoding first would let %2F become a separator and
  // invent a segment out of a filename, which is the traversal this refuses.
  const segments: string[] = [];
  for (const raw of path.split("/")) {
    const segment = decodeSegment(raw);
    // "" covers a leading slash, a trailing one and a doubled one, so none of
    // those needs a rule of its own.
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // Nothing left to climb out of, so the ref names something outside the
      // artifact. Refused rather than clamped to the root.
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.length === 0 ? null : segments.join("/");
}

// decodeURIComponent throws on a lone `%`, which a filename may legitimately
// contain — "100% done.css" is not exotic. The raw segment is a better guess
// than no path at all, and if it is wrong the asset is reported missing rather
// than served as some other file's bytes.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Concatenation only — folding is normaliseAssetPath's single job, and doing any
// of it here would be the second implementation this module exists to avoid.
// The separator is omitted for the document, whose refs are already keys.
export function joinRef(dir: string, ref: string): string {
  return dir === "" ? ref : `${dir}/${ref}`;
}

// The directory a bundle stylesheet's own refs resolve against: its key minus
// the last segment, and "" for a stylesheet at the root — which joinRef then
// leaves its refs untouched, exactly as the document's are.
export function assetDir(key: string): string {
  const cut = key.lastIndexOf("/");
  return cut === -1 ? "" : key.slice(0, cut);
}
