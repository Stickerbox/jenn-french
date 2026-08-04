import { normaliseAssetPath } from "@/lib/asset-path";
import { mediaTypeForPath } from "@/lib/asset-media-type";
import {
  contentTypeMatches,
  SKIP_REASONS,
  type RefKind,
} from "@/lib/asset-policy";
import type { AssetFetchResult } from "@/lib/asset-fetch";

// The files uploaded beside a document, keyed the way lib/asset-path.ts keys the
// document's own refs.
export type AssetBundle = Map<string, Uint8Array>;

export type AssetEntry = { path: string; bytes: Uint8Array };

// The local half of lib/page-inline.ts's two byte sources. It shares
// AssetFetcher's result shape so the walk never branches on which source
// answered, and it is synchronous because nothing here opens a socket — which is
// also why it does not live in lib/asset-fetch.ts, whose whole subject is the
// SSRF surface of one that does.
export type LocalResolver = (path: string, kind: RefKind) => AssetFetchResult;

// Keys are normalised here, once, so a caller uploading "./a.js" and a document
// referencing "a.js" meet. An entry addressing nothing inside the bundle is
// dropped rather than stored under a key no ref can produce.
export function assetBundle(entries: AssetEntry[]): AssetBundle {
  const bundle: AssetBundle = new Map();
  for (const entry of entries) {
    const key = normaliseAssetPath(entry.path);
    if (key === null) continue;
    bundle.set(key, entry.bytes);
  }
  return bundle;
}

export function bundleResolver(bundle: AssetBundle): LocalResolver {
  return (path, kind) => {
    const bytes = bundle.get(path);
    if (!bytes) return { ok: false, reason: SKIP_REASONS.missing };

    // Derived from the extension, then judged by the same rule that judges a
    // fetched response. A local file cannot serve a 404 page into a <script>,
    // but a confused artifact can point <script src> at its stylesheet, and one
    // shared check reports that instead of inlining CSS as JavaScript.
    const contentType = mediaTypeForPath(path);
    if (!contentTypeMatches(kind, contentType, path)) {
      return { ok: false, reason: SKIP_REASONS.wrongType };
    }

    return { ok: true, asset: { contentType, bytes } };
  };
}
