import { describe, it, expect } from "vitest";
import { effectivePages } from "@/lib/effective-pages";

const page = (id: string, iso: string) => ({
  id,
  createdAt: new Date(`${iso}T00:00:00Z`),
});

describe("effectivePages", () => {
  it("returns the student's own pages when nothing is shared with everyone", () => {
    expect(effectivePages([page("a", "2026-07-30")], []).map((p) => p.id)).toEqual([
      "a",
    ]);
  });

  it("returns the everyone pages when the student has none of their own", () => {
    expect(effectivePages([], [page("e", "2026-07-30")]).map((p) => p.id)).toEqual([
      "e",
    ]);
  });

  it("merges both, newest first", () => {
    const own = [page("a", "2026-07-28")];
    const everyone = [page("e", "2026-07-30")];
    expect(effectivePages(own, everyone).map((p) => p.id)).toEqual(["e", "a"]);
  });

  it("lists a page assigned both directly and to everyone only once", () => {
    const shared = page("a", "2026-07-30");
    expect(effectivePages([shared], [shared])).toHaveLength(1);
  });

  it("keeps the caller's own fields on the rows it returns", () => {
    const own = [{ ...page("a", "2026-07-30"), title: "Les nombres" }];
    expect(effectivePages(own, [])[0].title).toBe("Les nombres");
  });

  it("returns an empty list when both sides are empty", () => {
    expect(effectivePages([], [])).toEqual([]);
  });

  it("does not mutate either input", () => {
    const own = [page("a", "2026-07-28")];
    const everyone = [page("e", "2026-07-30")];
    effectivePages(own, everyone);
    expect(own.map((p) => p.id)).toEqual(["a"]);
    expect(everyone.map((p) => p.id)).toEqual(["e"]);
  });
});
