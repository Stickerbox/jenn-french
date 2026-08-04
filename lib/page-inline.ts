import { byteLength, MAX_PAGE_BYTES, validatePageHtml } from "@/lib/page-html";
import {
  applyReplacements,
  escapeScriptBody,
  findCssRefs,
  findExternalRefs,
  type ExternalRef,
  type Replacement,
} from "@/lib/page-refs";
import { isAllowedAssetUrl, SKIP_REASONS, type RefKind } from "@/lib/asset-policy";
import { fetchAsset } from "@/lib/asset-fetch";
import type { AssetFetcher, FetchedAsset } from "@/lib/asset-fetch";

export type SkippedRef = { url: string; reason: string };
export type InlineResult = { html: string; skipped: SkippedRef[] };

// Two fetches deep, counted in fetches rather than in documents. A <link> to
// fonts.googleapis.com is one fetch for the stylesheet and a second for each
// woff2 it names, which is the case this exists for; an @import inside an inline
// <style> is the same two, because an inline <style> is not a fetch. A third
// would mean a stylesheet importing a stylesheet that names a font, which has no
// case behind it, and recursion over input the server does not control is a
// budget problem waiting to happen.
const MAX_FETCH_DEPTH = 2;

// Room for the tags the rewrite adds around fetched text, so the accounting
// never has to be exact to stay under MAX_PAGE_BYTES.
const BUDGET_MARGIN = 4096;

// A missing image degrades to a gap; a missing script degrades to a page that
// does nothing. So a tight budget is spent on scripts first.
const PRIORITY: Record<RefKind, number> = { script: 0, style: 1, image: 2, font: 2 };

type Budget = { remaining: number };

export function inlineBudget(html: string): number {
  return Math.max(0, MAX_PAGE_BYTES - byteLength(html) - BUDGET_MARGIN);
}

export async function inlinePageAssets(
  html: string,
  fetchAsset: AssetFetcher,
  budgetBytes: number,
): Promise<InlineResult> {
  const refs = findExternalRefs(html);
  if (refs.length === 0) return { html, skipped: [] };

  const skipped: SkippedRef[] = [];
  const budget: Budget = { remaining: budgetBytes };
  const edits = await inlineRefs(refs, fetchAsset, budget, skipped, 1);

  const result = applyReplacements(html, edits);

  // The budget should make this unreachable. If it is ever reached, the publish
  // keeps the document it was handed rather than storing one the app's own
  // validator would reject — the next edit of that page would otherwise fail on
  // content the server itself created.
  if (!validatePageHtml(result).ok) {
    return {
      html,
      skipped: refs.map((ref) => ({ url: ref.url, reason: SKIP_REASONS.tooBig })),
    };
  }

  return { html: result, skipped };
}

async function inlineRefs(
  refs: ExternalRef[],
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
): Promise<Replacement[]> {
  const ordered = [...refs].sort(
    (a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.start - b.start,
  );

  const edits: Replacement[] = [];
  for (const ref of ordered) {
    const text = await inlineRef(ref, fetchAsset, budget, skipped, depth);
    if (text !== null) edits.push({ start: ref.start, end: ref.end, text });
  }
  return edits;
}

async function inlineRef(
  ref: ExternalRef,
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
): Promise<string | null> {
  const skip = (reason: string): null => {
    skipped.push({ url: ref.url, reason });
    return null;
  };

  if (ref.relative) return skip(SKIP_REASONS.relative);
  if (ref.unsafe) return skip(SKIP_REASONS.unsafe);
  if (depth > MAX_FETCH_DEPTH) return skip(SKIP_REASONS.tooDeep);
  // Checked here as well as inside the fetcher, so the rule is covered by a test
  // that uses a fake and a fake cannot make an unlisted host reachable.
  if (!isAllowedAssetUrl(ref.url)) return skip(SKIP_REASONS.notAllowed);

  const fetched = await fetchAsset(ref.url, ref.kind);
  if (!fetched.ok) return skip(fetched.reason);

  if (ref.kind === "style") {
    return inlineStyle(ref, fetched.asset, fetchAsset, budget, skipped, depth, skip);
  }

  if (ref.kind === "script") {
    const code = escapeScriptBody(new TextDecoder().decode(fetched.asset.bytes));
    // defer and async are no-ops on an inline script, so the code now runs where
    // the tag sits rather than after parsing. Harmless for a library, which is
    // all any host on the allowlist serves; the attributes are kept so the
    // source still reads the way its author wrote it.
    return charge(`<script${ref.attrs}>${code}</script>`, budget, skip);
  }

  const uri = dataUri(fetched.asset);
  return charge(ref.form === "css-url" ? `url("${uri}")` : uri, budget, skip);
}

async function inlineStyle(
  ref: ExternalRef,
  asset: FetchedAsset,
  fetchAsset: AssetFetcher,
  budget: Budget,
  skipped: SkippedRef[],
  depth: number,
  skip: (reason: string) => null,
): Promise<string | null> {
  const css = new TextDecoder().decode(asset.bytes);

  // A CSS escape does not apply inside a comment, so no substitution is safe in
  // every context — unlike <\/script in a script body, which means the same
  // thing everywhere. Skipped rather than half-escaped.
  if (/<\/style/i.test(css)) return skip(SKIP_REASONS.unsafe);

  // Charged before the nested pass, which charges its own assets. Charging the
  // finished text instead would count every inlined font twice.
  if (charge(css, budget, skip) === null) return null;

  const nested = await inlineRefs(
    findCssRefs(css, ref.url),
    fetchAsset,
    budget,
    skipped,
    depth + 1,
  );
  const inlined = applyReplacements(css, nested);

  return ref.form === "css-text" ? inlined : `<style${ref.attrs}>${inlined}</style>`;
}

function charge(
  text: string,
  budget: Budget,
  skip: (reason: string) => null,
): string | null {
  const cost = byteLength(text);
  if (cost > budget.remaining) return skip(SKIP_REASONS.tooBig);
  budget.remaining -= cost;
  return text;
}

// Buffer rather than btoa: btoa needs a binary string, and building one from a
// 100 KB font with String.fromCharCode overflows the argument list. This module
// is server-only — a route handler, a server action and a Node script — which is
// what makes Buffer available everywhere it runs.
function dataUri(asset: FetchedAsset): string {
  // Parameters are dropped: charset=utf-8 on a font means nothing, and a stray
  // `;` inside a data URI's media type would need escaping.
  const media =
    asset.contentType.split(";")[0].trim() || "application/octet-stream";
  return `data:${media};base64,${Buffer.from(asset.bytes).toString("base64")}`;
}

// The injected form above is the tested one; this is the one-line binding the
// three write paths share, so none of them has to know which fetcher or which
// budget is the right one.
export function inlinePage(html: string): Promise<InlineResult> {
  return inlinePageAssets(html, fetchAsset, inlineBudget(html));
}
