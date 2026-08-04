import {
  contentTypeMatches,
  isAllowedAssetUrl,
  MAX_ASSET_BYTES,
  SKIP_REASONS,
  type RefKind,
} from "@/lib/asset-policy";
import { readBoundedBytes } from "@/lib/bounded-body";

export type FetchedAsset = { contentType: string; bytes: Uint8Array };

export type AssetFetchResult =
  | { ok: true; asset: FetchedAsset }
  | { ok: false; reason: string };

// Injected into lib/page-inline.ts rather than imported by it, so the depth,
// budget and priority rules can be tested with a fake and no socket. Same
// arrangement as the measurer in lib/whiteboard-hit.ts.
export type AssetFetcher = (
  url: string,
  kind: RefKind,
) => Promise<AssetFetchResult>;

// A publish waits on this, so it cannot wait long. Five seconds is generous for
// a CDN edge and short enough that a dead host does not hold the request open.
const TIMEOUT_MS = 5_000;

export const fetchAsset: AssetFetcher = async (url, kind) => {
  // Before the fetch, never after. This is the control that decides whether the
  // rest of the function is reachable for a given URL at all.
  if (!isAllowedAssetUrl(url)) {
    return { ok: false, reason: SKIP_REASONS.notAllowed };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      // The control that carries the most weight here. Without it an
      // allowlisted host answering 302 to http://169.254.169.254/ turns the
      // allowlist into decoration, because the check above already passed.
      // A redirect is an error; it is never followed.
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "*/*" },
    });
  } catch {
    // A DNS failure, a TLS failure, a redirect and a timeout are one thing to
    // the teacher: it did not arrive. The reason she is shown says that.
    return { ok: false, reason: SKIP_REASONS.fetchFailed };
  }

  if (!response.ok) return { ok: false, reason: SKIP_REASONS.fetchFailed };

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentTypeMatches(kind, contentType, url)) {
    return { ok: false, reason: SKIP_REASONS.wrongType };
  }

  const bytes = await readBoundedBytes(response.body, MAX_ASSET_BYTES);
  if (bytes === null) return { ok: false, reason: SKIP_REASONS.tooBig };

  return { ok: true, asset: { contentType, bytes } };
};
