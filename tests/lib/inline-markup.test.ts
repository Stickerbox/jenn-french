import { describe, it, expect } from "vitest";
import { parseInlineMarkup } from "@/lib/inline-markup";

describe("parseInlineMarkup", () => {
  it("returns nothing for an empty string", () => {
    expect(parseInlineMarkup("")).toEqual([]);
  });

  it("returns plain text as a single token", () => {
    expect(parseInlineMarkup("just words")).toEqual([
      { type: "text", value: "just words" },
    ]);
  });

  it("parses a bold span", () => {
    expect(parseInlineMarkup("**j'étais**")).toEqual([
      { type: "bold", value: "j'étais" },
    ]);
  });

  it("parses an italic span", () => {
    expect(parseInlineMarkup("*softly*")).toEqual([
      { type: "italic", value: "softly" },
    ]);
  });

  it("parses a code span", () => {
    expect(parseInlineMarkup("`ch'tais`")).toEqual([
      { type: "code", value: "ch'tais" },
    ]);
  });

  it("parses text around and between spans", () => {
    expect(parseInlineMarkup("être → **j'étais** in `dz` speech")).toEqual([
      { type: "text", value: "être → " },
      { type: "bold", value: "j'étais" },
      { type: "text", value: " in " },
      { type: "code", value: "dz" },
      { type: "text", value: " speech" },
    ]);
  });

  it("prefers bold over italic when markers could overlap", () => {
    expect(parseInlineMarkup("**both**")).toEqual([
      { type: "bold", value: "both" },
    ]);
  });

  it("leaves an unmatched marker as literal text", () => {
    expect(parseInlineMarkup("2 * 3 = 6")).toEqual([
      { type: "text", value: "2 * 3 = 6" },
    ]);
  });

  it("leaves an unclosed bold marker as literal text", () => {
    expect(parseInlineMarkup("**oops")).toEqual([
      { type: "text", value: "**oops" },
    ]);
  });
});
