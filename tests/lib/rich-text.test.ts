import { describe, it, expect } from "vitest";
import {
  marksInRange,
  replaceRange,
  setColor,
  toggleEmphasis,
} from "@/lib/rich-text";

// Every offset here is into the plain text — "hello world", not the stored
// string — which is what a browser selection reports.

describe("toggleEmphasis", () => {
  it("bolds the selected words and nothing else", () => {
    expect(toggleEmphasis("hello world", 0, 5, "bold")).toBe("**hello** world");
  });

  it("removes emphasis when the whole selection already has it", () => {
    expect(toggleEmphasis("**hello** world", 0, 5, "bold")).toBe("hello world");
  });

  it("bolds the rest when only part of the selection is bold", () => {
    expect(toggleEmphasis("**hello** world", 0, 11, "bold")).toBe(
      "**hello world**",
    );
  });

  it("uses _ for italic", () => {
    expect(toggleEmphasis("hello", 0, 5, "italic")).toBe("_hello_");
  });

  it("wraps a phonetic in backticks and unwraps it again", () => {
    const on = toggleEmphasis("say freht here", 4, 9, "code");
    expect(on).toBe("say `freht` here");
    expect(toggleEmphasis(on, 4, 9, "code")).toBe("say freht here");
  });

  it("keeps a colour when emphasis changes underneath it", () => {
    expect(toggleEmphasis("<green>hello world</green>", 6, 11, "bold")).toBe(
      "<green>hello **world**</green>",
    );
  });

  it("does nothing to an empty selection", () => {
    expect(toggleEmphasis("hello", 2, 2, "bold")).toBe("hello");
  });
});

describe("setColor", () => {
  it("colours the selection", () => {
    expect(setColor("hello world", 6, 11, "red")).toBe("hello <red>world</red>");
  });

  it("replaces a colour rather than nesting inside it", () => {
    expect(setColor("<green>hello</green>", 0, 5, "blue")).toBe(
      "<blue>hello</blue>",
    );
  });

  it("splits a colour when only part of it is recoloured", () => {
    expect(setColor("<green>hello world</green>", 6, 11, "red")).toBe(
      "<green>hello </green><red>world</red>",
    );
  });

  it("keeps emphasis inside the recoloured range", () => {
    expect(setColor("**hello**", 0, 5, "gold")).toBe("<gold>**hello**</gold>");
  });
});

describe("marksInRange", () => {
  it("reports a mark only when the whole range carries it", () => {
    expect(marksInRange("**hello** world", 0, 5)).toEqual({
      bold: true,
      italic: false,
      code: false,
      color: null,
    });
    expect(marksInRange("**hello** world", 0, 11).bold).toBe(false);
  });

  it("reports no colour when the range spans two", () => {
    const markup = "<green>hello</green><red>world</red>";
    expect(marksInRange(markup, 0, 5).color).toBe("green");
    expect(marksInRange(markup, 0, 10).color).toBe(null);
  });

  it("reports nothing for an empty selection", () => {
    expect(marksInRange("<green>hello</green>", 2, 2)).toEqual({
      bold: false,
      italic: false,
      code: false,
      color: null,
    });
  });

  it("reports a phonetic span", () => {
    expect(marksInRange("say `freht` here", 4, 9).code).toBe(true);
    expect(marksInRange("say `freht` here", 0, 3).code).toBe(false);
  });
});

describe("replaceRange", () => {
  it("inserts text with the marks of the run to its left", () => {
    expect(replaceRange("<green>hello</green>", 5, 5, "!")).toBe(
      "<green>hello!</green>",
    );
  });

  it("inherits from the right at the very start", () => {
    expect(replaceRange("<green>hello</green>", 0, 0, "«")).toBe(
      "<green>«hello</green>",
    );
  });

  it("replaces a selection", () => {
    expect(replaceRange("hello world", 6, 11, "there")).toBe("hello there");
  });

  it("deletes when the text is empty", () => {
    expect(replaceRange("<green>hello</green> world", 5, 11, "")).toBe(
      "<green>hello</green>",
    );
  });

  it("starts from nothing on an empty field", () => {
    expect(replaceRange("", 0, 0, "a")).toBe("a");
  });

  it("does not carry a mark across from the other side of the selection", () => {
    expect(replaceRange("**a**b", 1, 2, "X")).toBe("**aX**");
  });
});
