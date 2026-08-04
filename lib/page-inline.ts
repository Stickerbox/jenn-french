import { byteLength, MAX_PAGE_BYTES, validatePageHtml } from "@/lib/page-html";
import {
  applyReplacements,
  escapeScriptBody,
  findCssRefs,
  findExternalRefs,
  type ExternalRef,
  type RefBase,
  type Replacement,
} from "@/lib/page-refs";
import { isAllowedAssetUrl, SKIP_REASONS, type RefKind } from "@/lib/asset-policy";
import { fetchAsset } from "@/lib/asset-fetch";
import type {
  AssetFetcher,
  AssetFetchResult,
  FetchedAsset,
} from "@/lib/asset-fetch";
import { assetDir } from "@/lib/asset-path";
import {
  bundleResolver,
  type AssetBundle,
  type LocalResolver,
} from "@/lib/page-bundle";

export type SkippedRef = { url: string; reason: string };
export type InlineResult = { html: string; skipped: SkippedRef[] };

// Two levels deep, and no third. Counted in resolutions, whether a fetch or a
// bundle read: a <link> to fonts.googleapis.com is one for the stylesheet and a
// second for each woff2 it names, which is the case this exists for, and a
// sibling styles.css naming a local font is the same two. An @import inside an
// inline <style> is still the first level, because an inline <style> is neither
// a fetch nor a read.
//
// It bounds two different things at once. For a fetch it is a budget: recursion
// over input the server does not control is a problem waiting to happen. For a
// bundle read, where there is no network to spend, it is what terminates a
// cycle — a.css importing b.css importing a.css.
const MAX_REF_DEPTH = 2;

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
  // Absent when nothing was uploaded beside the document, which is a different
  // thing from an empty one — see inlineRef.
  local?: LocalResolver,
): Promise<InlineResult> {
  const refs = findExternalRefs(html);
  if (refs.length === 0) return { html, skipped: [] };

  const skipped: SkippedRef[] = [];
  const budget: Budget = { remaining: budgetBytes };
  const edits = await inlineRefs(refs, fetchAsset, budget, skipped, 1, local);

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
  local: LocalResolver | undefined,
): Promise<Replacement[]> {
  const ordered = [...refs].sort(
    (a, b) =>
      PRIORITY[a.kind] - PRIORITY[b.kind] ||
      // Local before remote within a kind. A sibling app.js is the page's own
      // behaviour and nothing else can supply it; a CDN library is a dependency
      // whose absence still leaves the document rendering.
      Number(b.relative) - Number(a.relative) ||
      a.start - b.start,
  );

  const edits: Replacement[] = [];
  for (const ref of ordered) {
    const text = await inlineRef(ref, fetchAsset, budget, skipped, depth, local);
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
  local: LocalResolver | undefined,
): Promise<string | null> {
  const skip = (reason: string): null => {
    skipped.push({ url: ref.url, reason });
    return null;
  };

  // Both of these are decided before either source is consulted, and both apply
  // to both: an @import carrying a media condition is no safer for having come
  // off a disk, and the depth cap bounds a local cycle as well as a fetch.
  if (ref.unsafe) return skip(SKIP_REASONS.unsafe);
  if (depth > MAX_REF_DEPTH) return skip(SKIP_REASONS.tooDeep);

  let result: AssetFetchResult;
  if (ref.relative) {
    // No bundle at all: the admin's paste box and the browser extension, where
    // only the document itself was ever uploaded. A different sentence from a
    // bundle that did not contain the file, so a different reason.
    if (!local) return skip(SKIP_REASONS.relative);
    result =
      ref.localPath === null
        ? { ok: false, reason: SKIP_REASONS.missing }
        : local(ref.localPath, ref.kind);
  } else {
    // Checked here as well as inside the fetcher, so the rule is covered by a
    // test that uses a fake and a fake cannot make an unlisted host reachable.
    if (!isAllowedAssetUrl(ref.url)) return skip(SKIP_REASONS.notAllowed);
    result = await fetchAsset(ref.url, ref.kind);
  }

  if (!result.ok) return skip(result.reason);

  if (ref.kind === "style") {
    return inlineStyle(ref, result.asset, fetchAsset, budget, skipped, depth, skip, local);
  }

  if (ref.kind === "script") {
    const code = escapeScriptBody(new TextDecoder().decode(result.asset.bytes));
    // defer and async are no-ops on an inline script, so the code now runs where
    // the tag sits rather than after parsing. Harmless for a library, which is
    // all any host on the allowlist serves; the attributes are kept so the
    // source still reads the way its author wrote it.
    return charge(`<script${ref.attrs}>${code}</script>`, budget, skip);
  }

  const uri = dataUri(result.asset);
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
  local: LocalResolver | undefined,
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
    findCssRefs(css, styleBase(ref)),
    fetchAsset,
    budget,
    skipped,
    depth + 1,
    local,
  );
  const inlined = applyReplacements(css, nested);

  return ref.form === "css-text" ? inlined : `<style${ref.attrs}>${inlined}</style>`;
}

// Where a stylesheet's own relative refs resolve from. A fetched stylesheet
// resolves them against its URL, which is what CSS does; a bundle stylesheet
// resolves them against its own directory inside the bundle, which is the same
// rule against a different kind of address.
function styleBase(ref: ExternalRef): RefBase {
  if (!ref.relative) return { kind: "remote", url: ref.url };
  // Non-null here: inlineRef refuses a relative ref with no localPath before any
  // bytes are resolved, so this is only reached for one that has a key.
  return { kind: "local", dir: assetDir(ref.localPath ?? "") };
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
// budget is the right one. The bundle defaults to empty, which is what leaves
// app/page-actions.ts and scripts/backfill-page-assets.mjs untouched.
export function inlinePage(
  html: string,
  bundle: AssetBundle = new Map(),
): Promise<InlineResult> {
  return inlinePageAssets(
    html,
    fetchAsset,
    inlineBudget(html),
    // An empty bundle passes UNDEFINED, not a resolver over nothing. "No files
    // were uploaded" and "this file was not among the uploaded ones" are
    // different report lines, and the paste box must keep the first.
    bundle.size === 0 ? undefined : bundleResolver(bundle),
  );
}
