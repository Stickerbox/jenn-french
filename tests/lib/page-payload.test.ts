import { describe, it, expect } from "vitest";
import { parsePagePayload } from "@/lib/page-payload";

const valid = {
  title: "Verb drills",
  html: "<!doctype html><p>Bonjour</p>",
};

describe("parsePagePayload", () => {
  it("accepts the minimum payload", () => {
    const result = parsePagePayload(valid);
    expect(result).toEqual({
      ok: true,
      payload: {
        title: "Verb drills",
        html: "<!doctype html><p>Bonjour</p>",
        groups: null,
        slug: null,
      },
    });
  });

  it("accepts groups and a slug", () => {
    const result = parsePagePayload({
      ...valid,
      groups: ["a1", "tuesday-adults"],
      slug: "verb-drills",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.groups).toEqual(["a1", "tuesday-adults"]);
      expect(result.payload.slug).toBe("verb-drills");
    }
  });

  it("keeps an empty groups array distinct from an absent one", () => {
    const absent = parsePagePayload(valid);
    const empty = parsePagePayload({ ...valid, groups: [] });
    expect(absent.ok && absent.payload.groups).toBe(null);
    expect(empty.ok && empty.payload.groups).toEqual([]);
  });

  it("normalises a supplied slug", () => {
    const result = parsePagePayload({ ...valid, slug: "Passé Composé!" });
    expect(result.ok && result.payload.slug).toBe("passe-compose");
  });

  it("trims the title", () => {
    const result = parsePagePayload({ ...valid, title: "  Verb drills  " });
    expect(result.ok && result.payload.title).toBe("Verb drills");
  });

  it("rejects a body that is not an object", () => {
    expect(parsePagePayload(null).ok).toBe(false);
    expect(parsePagePayload("title=x").ok).toBe(false);
    expect(parsePagePayload([valid]).ok).toBe(false);
  });

  it("rejects a missing or empty title", () => {
    expect(parsePagePayload({ html: valid.html }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: "   " }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, title: 7 }).ok).toBe(false);
  });

  it("rejects html that fails validation, passing the message through", () => {
    const result = parsePagePayload({ ...valid, html: "not a page" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/i);
  });

  it("rejects groups that are not an array of non-empty strings", () => {
    expect(parsePagePayload({ ...valid, groups: "a1" }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [1] }).ok).toBe(false);
    expect(parsePagePayload({ ...valid, groups: [""] }).ok).toBe(false);
  });

  it("rejects a slug that is not a string", () => {
    expect(parsePagePayload({ ...valid, slug: 12 }).ok).toBe(false);
  });

  it("treats an explicit null the same as an absent key", () => {
    const result = parsePagePayload({ ...valid, groups: null, slug: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.groups).toBe(null);
      expect(result.payload.slug).toBe(null);
    }
  });
});
