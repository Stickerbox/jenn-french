import { validatePageHtml } from "@/lib/page-html";
import { slugify } from "@/lib/page-slug";

export type PagePayload = {
  title: string;
  html: string;
  // null means the caller said nothing about groups, which on a replace leaves
  // the existing assignments alone. An empty array means "no groups".
  groups: string[] | null;
  slug: string | null;
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
  if (raw.groups !== undefined) {
    if (
      !Array.isArray(raw.groups) ||
      raw.groups.some((g) => typeof g !== "string" || g.trim() === "")
    ) {
      return { ok: false, error: "groups must be an array of group slugs." };
    }
    groups = (raw.groups as string[]).map((g) => g.trim());
  }

  let slug: string | null = null;
  if (raw.slug !== undefined) {
    if (typeof raw.slug !== "string") {
      return { ok: false, error: "slug must be a string." };
    }
    slug = slugify(raw.slug);
  }

  return { ok: true, payload: { title, html: html.html, groups, slug } };
}
