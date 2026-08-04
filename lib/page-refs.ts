import { assetKindForUrl, type RefKind } from "@/lib/asset-policy";

// A deliberately small matcher, in the spirit of lib/inline-markup.ts: the
// shapes it has to recognise are narrow and known, and an HTML parser would be
// this project's first parsing dependency. Nothing here validates markup — an
// unrecognised shape is left alone, which means it stays blocked rather than
// becoming broken.
//
// The known limit of matching attributes with [^>]* is an attribute value
// containing a literal `>`. Such a tag is not recognised and so not inlined.
// Accepted: the same contract the inline markup parser has, where an unclosed
// marker stays literal.

// What the replacement looks like, which is a different question from RefKind —
// that one says what to fetch, this one says what to write in its place: a <link>
// becomes a <style> element, an @import inside a <style> becomes the
// stylesheet's text with no element around it, and an image becomes a bare data
// URI spliced in where its URL was.
export type RefForm =
  | "script-element"
  | "style-element"
  | "css-text"
  | "url-value"
  | "css-url";

export type ExternalRef = {
  kind: RefKind;
  form: RefForm;
  // Absolute and entity-decoded, unless `relative` is true — in which case this
  // is the raw text, kept only so the report can name it.
  url: string;
  // The span the replacement takes over.
  start: number;
  end: number;
  // Carried onto the inline element, already prefixed with a space when
  // non-empty. Always "" unless form is script-element or style-element.
  attrs: string;
  relative: boolean;
  // Known to be unsafe to inline before anything is fetched: an @import
  // carrying a media condition. Reported, never fetched.
  unsafe: boolean;
};

export type Replacement = { start: number; end: number; text: string };

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const LINK = /<link\b([^>]*)>/gi;
const IMG = /<img\b([^>]*)>/gi;
const STYLE = /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi;

const CSS_IMPORT =
  /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s"')]+))\s*\)?([^;]*);/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;

// Nothing to fetch for any of these, so they are not refs at all.
const IGNORED = /^(?:data:|blob:|about:|javascript:|mailto:|tel:|#)/i;

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// A URL in an HTML attribute is entity-encoded, and `&` is the only character
// that shows up that way in practice: a Google Fonts href carries
// `?family=Inter&amp;display=swap`. Deliberately not a general entity decoder.
// &amp; decodes last, for the reason tools/publish-dia-artifact.sh records —
// doing it first would collapse a deliberately double-escaped value by a level.
function decodeAttrUrl(value: string): string {
  return value
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&amp;/gi, "&");
}

type Target = { url: string; relative: boolean };

// baseUrl is the document (null) or the stylesheet a ref was found inside.
function resolveRef(raw: string, baseUrl: string | null): Target | null {
  const value = decodeAttrUrl(raw).trim();
  if (!value || IGNORED.test(value)) return null;
  if (SCHEME.test(value)) return { url: value, relative: false };
  // A protocol-relative URL is absolute with the page's scheme, which is https
  // in production. Upgrading it here means the allowlist gets to judge it
  // rather than it being silently dropped as relative.
  if (value.startsWith("//")) return { url: `https:${value}`, relative: false };
  if (baseUrl === null) return { url: value, relative: true };
  try {
    // Resolved against the stylesheet's own URL, not the page's — that is what
    // CSS does, and it is what makes url(./fonts/x.woff2) inside a jsdelivr
    // stylesheet reach jsdelivr. Resolution preserves the host, so this cannot
    // reach off the allowlist; the allowlist is checked again regardless.
    return { url: new URL(value, baseUrl).toString(), relative: false };
  } catch {
    return null;
  }
}

type AttrMatch = { value: string; start: number; end: number };

// Returns the value and where the value's text sits inside `attrs`, so a caller
// can splice into it without rebuilding the tag.
function attrMatch(attrs: string, name: string): AttrMatch | null {
  const found = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  ).exec(attrs);
  if (!found) return null;

  const value = found[1] ?? found[2] ?? found[3] ?? "";
  const quoted = found[1] !== undefined || found[2] !== undefined;
  const end = found.index + found[0].length - (quoted ? 1 : 0);
  return { value, start: end - value.length, end };
}

function attr(attrs: string, name: string): string | null {
  return attrMatch(attrs, name)?.value ?? null;
}

// Returns "" or a string already starting with one space, so a caller can write
// `<style${attrs}>` without deciding about spacing.
function attrsWithout(attrs: string, name: string): string {
  const rest = attrs
    .replace(
      new RegExp(`\\s*\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i"),
      "",
    )
    .replace(/\s*\/\s*$/, "")
    .trim();
  return rest ? ` ${rest}` : "";
}

function mediaAttr(attrs: string): string {
  const media = attr(attrs, "media");
  return media ? ` media="${media.replace(/"/g, "&quot;")}"` : "";
}

// A token list, so rel="preload stylesheet" counts and rel="icon" does not.
// Substring matching would make an icon a stylesheet the first time someone
// wrote rel="apple-touch-icon".
function isStylesheet(attrs: string): boolean {
  const rel = attr(attrs, "rel");
  return rel !== null && rel.toLowerCase().split(/\s+/).includes("stylesheet");
}

// Where group 1 (the attributes) starts, relative to the document. The first
// `>` in the match closes the open tag, because [^>]* cannot cross one.
function attrsOffset(match: RegExpExecArray): number {
  return match.index + match[0].indexOf(">") - match[1].length;
}

export function findExternalRefs(html: string): ExternalRef[] {
  const refs: ExternalRef[] = [];

  for (const match of html.matchAll(SCRIPT)) {
    const target = resolveRef(attr(match[1], "src") ?? "", null);
    if (!target) continue;
    refs.push({
      kind: "script",
      form: "script-element",
      url: target.url,
      start: match.index,
      end: match.index + match[0].length,
      attrs: attrsWithout(match[1], "src"),
      relative: target.relative,
      unsafe: false,
    });
  }

  for (const match of html.matchAll(LINK)) {
    if (!isStylesheet(match[1])) continue;
    const target = resolveRef(attr(match[1], "href") ?? "", null);
    if (!target) continue;
    refs.push({
      kind: "style",
      form: "style-element",
      url: target.url,
      start: match.index,
      end: match.index + match[0].length,
      // Only media travels. A <style media="print"> means what the <link>
      // meant; nothing else a <link> carries has a meaning on a <style>.
      attrs: mediaAttr(match[1]),
      relative: target.relative,
      unsafe: false,
    });
  }

  for (const match of html.matchAll(IMG)) {
    const src = attrMatch(match[1], "src");
    if (!src) continue;
    const target = resolveRef(src.value, null);
    if (!target) continue;
    const offset = attrsOffset(match);
    refs.push({
      kind: assetKindForUrl(target.url),
      form: "url-value",
      url: target.url,
      start: offset + src.start,
      end: offset + src.end,
      attrs: "",
      relative: target.relative,
      unsafe: false,
    });
  }

  // An inline <style> is not a fetch, so refs inside it are first-depth fetches
  // exactly like the document's own — which is what makes the common
  // `@import url(fonts.googleapis.com/...)` reach its fonts within the depth cap.
  for (const match of html.matchAll(STYLE)) {
    const contentAt = match.index + match[0].indexOf(">") + 1;
    refs.push(...findCssRefs(match[2], null, contentAt));
  }

  return refs;
}

// `offset` is where this CSS sits inside the document, so a ref found in an
// inline <style> carries a span the document's own splicer can use. It is 0
// when the CSS was fetched and is being rewritten on its own.
export function findCssRefs(
  css: string,
  baseUrl: string | null,
  offset = 0,
): ExternalRef[] {
  const refs: ExternalRef[] = [];
  const importSpans: Array<[number, number]> = [];

  for (const match of css.matchAll(CSS_IMPORT)) {
    importSpans.push([match.index, match.index + match[0].length]);
    const target = resolveRef(match[1] ?? match[2] ?? match[3] ?? "", baseUrl);
    if (!target) continue;
    refs.push({
      kind: "style",
      form: "css-text",
      url: target.url,
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      attrs: "",
      relative: target.relative,
      // `@import "a.css" screen;` means "only for screens", and replacing the
      // rule with the stylesheet's text would apply it everywhere. Reported
      // rather than silently widened.
      unsafe: (match[4] ?? "").trim() !== "",
    });
  }

  for (const match of css.matchAll(CSS_URL)) {
    // A url() inside an @import is that rule's own target, already handled.
    const inImport = importSpans.some(
      ([from, to]) => match.index >= from && match.index < to,
    );
    if (inImport) continue;
    const target = resolveRef(match[1] ?? match[2] ?? match[3] ?? "", baseUrl);
    if (!target) continue;
    refs.push({
      kind: assetKindForUrl(target.url),
      form: "css-url",
      url: target.url,
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      attrs: "",
      relative: target.relative,
      unsafe: false,
    });
  }

  return refs;
}

// A JavaScript bundle containing the literal `</script>` — in a string, a
// template literal or a regex — closes the tag early once it is inlined,
// because the HTML tokenizer does not know it is inside a string. `<\/script`
// is the same JavaScript in all three of those contexts.
//
// Residual: String.raw around a template literal holding `</script>` changes
// meaning, since \/ stops being an escape there. Accepted — refusing to inline
// any script that so much as mentions `</script` would reject libraries that
// legitimately carry HTML snippets.
export function escapeScriptBody(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1");
}

// Splices rather than replaces. Two refs to the same URL — an artifact using
// one icon twice — and a ref whose text is a substring of another's both defeat
// String.replace, silently and in different ways.
export function applyReplacements(
  source: string,
  edits: Replacement[],
): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;

  for (const edit of ordered) {
    // Overlapping spans cannot happen from the passes above; if one ever does,
    // the first wins rather than the output being corrupted.
    if (edit.start < cursor) continue;
    out += source.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }

  return out + source.slice(cursor);
}
