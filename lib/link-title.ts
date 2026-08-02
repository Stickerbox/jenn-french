const MAX_TITLE_LENGTH = 80;

// Words that route rather than name. A URL ending in one of these is telling
// you what to do with the page, not what the page is.
const NOISE = new Set([
  "edit", "view", "preview", "index", "home", "default",
  // Single letters and routing words are Google's path furniture: /document/d/<id>/edit.
  "d", "e", "u", "p", "document",
]);

// A segment names something when it either has a separator in it — which an
// opaque key almost never does — or is made only of letters. A run of letters
// AND digits with nothing between them is an id: "1AbCdEfGh2IjKl", "xY12ab".
//
// Known imperfection, accepted: a short all-letter id like "xyz" passes this
// and becomes the title "Xyz". Tightening it far enough to catch that also
// catches real one-word names like "verbes", which is the worse trade.
function names(segment: string): boolean {
  if (!segment) return false;
  if (NOISE.has(segment.toLowerCase())) return false;
  if (!/[a-zA-ZÀ-ɏ]/.test(segment)) return false;
  if (/[-_]/.test(segment)) return true;
  return !/\d/.test(segment);
}

// Capitalises each word and leaves the rest of it alone: "Lesson_3_Notes"
// should stay "Lesson 3 Notes", not become "Lesson 3 notes".
function titleCase(value: string): string {
  return value.replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1));
}

// Derived from the URL string alone. NO REQUEST IS MADE — not by the server,
// not by the browser. Fetching the page to read its real <title> would be
// request forgery on a student-supplied URL, and for the case links exist to
// serve (a Google Doc that is not public) it would return "Sign in".
export function titleFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  // Rightmost first: the last meaningful segment is the page, the ones left of
  // it are the folders it sits in.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    let segment: string;
    try {
      segment = decodeURIComponent(segments[i]);
    } catch {
      // A stray % is not a reason to give up on the segment.
      segment = segments[i];
    }

    // The extension is how the file was saved, not what it is called.
    const withoutExtension = segment.replace(/\.[a-z0-9]{1,5}$/i, "");
    if (!names(withoutExtension)) continue;

    const words = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return titleCase(words).slice(0, MAX_TITLE_LENGTH);
  }

  // The same fallback validateLink already applied when the title field was
  // left blank, so nothing about an untitled link changes.
  return parsed.hostname.replace(/^www\./, "");
}
