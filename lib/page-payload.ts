import { validatePageHtml } from "@/lib/page-html";
import { slugify } from "@/lib/page-slug";
import type { AssetEntry } from "@/lib/page-bundle";

// The whole request body, which now carries a document AND the files beside it.
// Deliberately larger than MAX_PAGE_BYTES, because those two stopped measuring
// the same thing: this holds assets as base64, a third larger than the bytes,
// while MAX_PAGE_BYTES holds them inlined into the document.
//
// 3 MB is chosen the way MAX_PDF_BYTES was — it sits under nginx's
// client_max_body_size 4m (docs/DEPLOYMENT.md item 11), so raising it needs no
// SSH session, and a rejection is this app's own message rather than a raw 413
// that Next never sees and cannot explain.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

// A generous ceiling on how many files one page may bring, not a tuned number.
// Past it the publish fails with this limit named, rather than dropping files
// silently: tools/publish-dia-artifact.sh applies no cap of its own precisely so
// there is one authority and the two cannot drift.
export const MAX_ASSET_COUNT = 50;

// Buffer.from(x, "base64") does not throw on invalid input, it silently
// truncates, so an unchecked payload would store a corrupt asset rather than
// report one. Padding is required because every client here produces it.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type PagePayload = {
  title: string;
  html: string;
  // null means the caller said nothing about groups, which on a replace leaves
  // the existing assignments alone. An empty array means "no groups".
  groups: string[] | null;
  slug: string | null;
  // The files uploaded beside the document, empty when there were none. Paths
  // are carried through EXACTLY as the caller sent them: the ref as written in
  // the document, unfolded and still percent-encoded. Normalising belongs to
  // lib/asset-path.ts, reached through assetBundle, and doing any of it here
  // would put that rule in a second place.
  assets: AssetEntry[];
};

export type PagePayloadResult =
  | { ok: true; payload: PagePayload }
  | { ok: false; error: string };

export function parsePagePayload(body: unknown): PagePayloadResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object." };
  }

  const raw = body as Record<string, unknown>;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return { ok: false, error: "A title is required." };

  const html = validatePageHtml(raw.html);
  if (!html.ok) return { ok: false, error: html.error };

  let groups: string[] | null = null;
  // A client that sends null for an optional field means the same thing as one
  // that omits it; the distinction that matters is null-or-absent versus [].
  if (raw.groups !== undefined && raw.groups !== null) {
    if (
      !Array.isArray(raw.groups) ||
      raw.groups.some((g) => typeof g !== "string" || g.trim() === "")
    ) {
      return { ok: false, error: "groups must be an array of group slugs." };
    }
    groups = (raw.groups as string[]).map((g) => g.trim());
  }

  let slug: string | null = null;
  if (raw.slug !== undefined && raw.slug !== null) {
    if (typeof raw.slug !== "string") {
      return { ok: false, error: "slug must be a string." };
    }
    slug = slugify(raw.slug);
  }

  let assets: AssetEntry[] = [];
  // Absent and null mean the same thing, as they do for `groups`: a caller that
  // uploaded nothing beside the document.
  if (raw.assets !== undefined && raw.assets !== null) {
    const parsed = parseAssets(raw.assets);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    assets = parsed.assets;
  }

  return {
    ok: true,
    payload: { title, html: html.html, groups, slug, assets },
  };
}

type AssetsResult =
  | { ok: true; assets: AssetEntry[] }
  | { ok: false; error: string };

// A malformed bundle is a 400, not a report line. Every client here is ours, so a
// bad shape means one of them is broken — the same call this module already makes
// for a bad `groups` array. An asset that cannot be USED is a different thing,
// and lib/page-inline.ts reports those without ever failing the publish.
//
// Server-only, for the Buffer decode. lib/page-inline.ts records the same note
// for the same reason.
function parseAssets(value: unknown): AssetsResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "assets must be an array." };
  }
  if (value.length > MAX_ASSET_COUNT) {
    return {
      ok: false,
      error: `A page may carry at most ${MAX_ASSET_COUNT} files.`,
    };
  }

  const assets: AssetEntry[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, error: "Each asset must be an object." };
    }

    const { path, base64 } = entry as Record<string, unknown>;
    if (typeof path !== "string" || path.trim() === "") {
      return { ok: false, error: "Each asset needs a path." };
    }
    if (typeof base64 !== "string") {
      return { ok: false, error: `The contents of ${path} are missing.` };
    }
    if (base64.length % 4 !== 0 || !BASE64.test(base64)) {
      return {
        ok: false,
        error: `The contents of ${path} are not valid base64.`,
      };
    }

    assets.push({ path, bytes: new Uint8Array(Buffer.from(base64, "base64")) });
  }

  return { ok: true, assets };
}
