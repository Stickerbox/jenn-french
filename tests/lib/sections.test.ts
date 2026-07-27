import { describe, it, expect } from "vitest";
import {
  readSections,
  normaliseSections,
  moveSection,
  seedSections,
  backfillSections,
  withIds,
  isIdiomSection,
  IDIOM_TITLE,
  PRONUNCIATION_TITLE,
  type CardSection,
} from "@/lib/sections";

const s = (title: string, body: string): CardSection => ({ title, body });

describe("readSections", () => {
  it("returns an empty list for null or undefined", () => {
    expect(readSections(null)).toEqual([]);
    expect(readSections(undefined)).toEqual([]);
  });

  it("returns an empty list for a value that is not an array", () => {
    expect(readSections("Grammar")).toEqual([]);
    expect(readSections({ title: "Grammar", body: "x" })).toEqual([]);
    expect(readSections(42)).toEqual([]);
  });

  it("reads a well-formed array", () => {
    expect(readSections([{ title: "Grammar", body: "x" }])).toEqual([
      s("Grammar", "x"),
    ]);
  });

  it("drops malformed entries but keeps the good ones", () => {
    expect(
      readSections([
        { title: "Grammar", body: "x" },
        null,
        "nope",
        { title: "no body" },
        { title: 7, body: "wrong type" },
        { title: "Tip", body: "y" },
      ]),
    ).toEqual([s("Grammar", "x"), s("Tip", "y")]);
  });

  it("ignores extra properties rather than carrying them through", () => {
    expect(readSections([{ title: "A", body: "b", position: 3 }])).toEqual([
      s("A", "b"),
    ]);
  });
});

describe("normaliseSections", () => {
  it("trims titles and bodies", () => {
    expect(normaliseSections([s("  Grammar  ", "  x  ")])).toEqual([
      s("Grammar", "x"),
    ]);
  });

  it("drops sections that are blank in both fields", () => {
    expect(normaliseSections([s("A", "b"), s("", ""), s("  ", "  ")])).toEqual([
      s("A", "b"),
    ]);
  });

  it("keeps a section with a title and no body", () => {
    expect(normaliseSections([s("Register", "")])).toEqual([s("Register", "")]);
  });

  it("keeps a section with a body and no title", () => {
    expect(normaliseSections([s("", "orphan text")])).toEqual([
      s("", "orphan text"),
    ]);
  });

  it("does not mutate its argument", () => {
    const input = [s(" A ", " b ")];
    normaliseSections(input);
    expect(input).toEqual([s(" A ", " b ")]);
  });
});

describe("moveSection", () => {
  const three = [s("A", ""), s("B", ""), s("C", "")];

  it("moves a section up", () => {
    expect(moveSection(three, 1, -1).map((x) => x.title)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("moves a section down", () => {
    expect(moveSection(three, 1, 1).map((x) => x.title)).toEqual([
      "A",
      "C",
      "B",
    ]);
  });

  it("is a no-op at the top", () => {
    expect(moveSection(three, 0, -1)).toEqual(three);
  });

  it("is a no-op at the bottom", () => {
    expect(moveSection(three, 2, 1)).toEqual(three);
  });

  it("is a no-op for an index outside the list", () => {
    expect(moveSection(three, 9, -1)).toEqual(three);
    expect(moveSection(three, -1, 1)).toEqual(three);
  });

  it("does not mutate its argument", () => {
    moveSection(three, 1, -1);
    expect(three.map((x) => x.title)).toEqual(["A", "B", "C"]);
  });
});

describe("seedSections", () => {
  it("produces Grammar, an empty pronunciation, and the idiom in order", () => {
    expect(seedSections("g", "i")).toEqual([
      s("Grammar", "g"),
      s(PRONUNCIATION_TITLE, ""),
      s("Idiom of the day", "i"),
    ]);
  });
});

describe("backfillSections", () => {
  it("maps all four columns in render order", () => {
    expect(
      backfillSections({
        examples: "g",
        pronunciation: "p",
        tip: "t",
        idiom: "i",
      }),
    ).toEqual([
      s("Grammar", "g"),
      s(PRONUNCIATION_TITLE, "p"),
      s("Tip", "t"),
      s("Idiom of the day", "i"),
    ]);
  });

  it("skips blank and null columns", () => {
    expect(
      backfillSections({
        examples: "g",
        pronunciation: null,
        tip: "   ",
        idiom: "i",
      }),
    ).toEqual([s("Grammar", "g"), s("Idiom of the day", "i")]);
  });

  it("returns an empty list when every column is empty", () => {
    expect(
      backfillSections({
        examples: "",
        pronunciation: null,
        tip: null,
        idiom: null,
      }),
    ).toEqual([]);
  });
});

describe("withIds", () => {
  it("assigns a deterministic id per position", () => {
    expect(withIds([s("A", "a"), s("B", "b")]).map((x) => x.id)).toEqual([
      "s-0",
      "s-1",
    ]);
  });

  it("keeps an id a section already has", () => {
    const existing = [{ title: "A", body: "a", id: "kept" }, s("B", "b")];
    expect(withIds(existing).map((x) => x.id)).toEqual(["kept", "s-1"]);
  });

  it("leaves title and body untouched", () => {
    expect(withIds([s("A", "a")])[0]).toMatchObject({ title: "A", body: "a" });
  });

  it("does not mutate its argument", () => {
    const input = [s("A", "a")];
    withIds(input);
    expect(input[0].id).toBeUndefined();
  });
});

describe("normaliseSections strips the client-only id", () => {
  it("never lets an id reach the database", () => {
    const result = normaliseSections([{ title: "A", body: "a", id: "s-0" }]);
    expect(result).toEqual([{ title: "A", body: "a" }]);
    expect("id" in result[0]).toBe(false);
  });
});

describe("isIdiomSection", () => {
  it("matches the seeded title", () => {
    expect(isIdiomSection(IDIOM_TITLE)).toBe(true);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(isIdiomSection("  idiom of the day  ")).toBe(true);
    expect(isIdiomSection("IDIOM OF THE DAY")).toBe(true);
  });

  it("does not match another section", () => {
    expect(isIdiomSection("Grammar")).toBe(false);
    expect(isIdiomSection("Idiom")).toBe(false);
    expect(isIdiomSection("")).toBe(false);
  });
});
