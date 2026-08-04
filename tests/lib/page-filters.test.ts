import { describe, expect, it } from "vitest";
import { filterPagesByKind } from "@/lib/page-filters";

const pages = [
  { id: "a", kind: "html" as const },
  { id: "b", kind: "link" as const },
  { id: "c", kind: "html" as const },
  { id: "d", kind: "pdf" as const },
];

describe("filterPagesByKind", () => {
  it("returns everything for all", () => {
    expect(filterPagesByKind(pages, "all")).toHaveLength(4);
  });

  it("narrows to pages", () => {
    expect(filterPagesByKind(pages, "html").map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("narrows to links", () => {
    expect(filterPagesByKind(pages, "link").map((p) => p.id)).toEqual(["b"]);
  });

  it("narrows to PDFs", () => {
    // Here to record that a third kind cost this function nothing: it is
    // generic over { kind: PageKind }, so a third value in that union is a
    // third value it already handles.
    expect(filterPagesByKind(pages, "pdf").map((p) => p.id)).toEqual(["d"]);
  });

  it("preserves order", () => {
    expect(filterPagesByKind(pages, "all").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
