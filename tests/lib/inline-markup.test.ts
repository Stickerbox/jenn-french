import { describe, it, expect } from "vitest";
import {
  parseInlineMarkup,
  serialiseRuns,
  toPlainText,
  type MarkupRun,
} from "@/lib/inline-markup";

function run(text: string, marks: Partial<MarkupRun> = {}): MarkupRun {
  return { text, bold: false, italic: false, code: false, color: null, ...marks };
}

describe("parseInlineMarkup", () => {
  it("returns nothing for an empty string", () => {
    expect(parseInlineMarkup("")).toEqual([]);
  });

  it("returns plain text as a single run", () => {
    expect(parseInlineMarkup("just words")).toEqual([run("just words")]);
  });

  it("parses bold, italic and code", () => {
    expect(parseInlineMarkup("**j'étais**")).toEqual([
      run("j'étais", { bold: true }),
    ]);
    expect(parseInlineMarkup("_softly_")).toEqual([
      run("softly", { italic: true }),
    ]);
    expect(parseInlineMarkup("`ch'tais`")).toEqual([
      run("ch'tais", { code: true }),
    ]);
  });

  it("still reads * as italic, the marker every earlier card used", () => {
    expect(parseInlineMarkup("*softly*")).toEqual([
      run("softly", { italic: true }),
    ]);
  });

  it("parses a colour span", () => {
    expect(parseInlineMarkup("<green>ça va</green>")).toEqual([
      run("ça va", { color: "green" }),
    ]);
  });

  it("combines bold and italic inside a colour", () => {
    expect(parseInlineMarkup("<green>**_hello_**</green>")).toEqual([
      run("hello", { bold: true, italic: true, color: "green" }),
    ]);
  });

  it("lets bold span a colour boundary", () => {
    expect(
      parseInlineMarkup("<green>**_hello_<red>jordan</red>**</green>"),
    ).toEqual([
      run("hello", { bold: true, italic: true, color: "green" }),
      run("jordan", { bold: true, color: "red" }),
    ]);
  });

  it("gives the innermost colour to nested spans", () => {
    expect(parseInlineMarkup("<green>a<red>b</red>c</green>")).toEqual([
      run("a", { color: "green" }),
      run("b", { color: "red" }),
      run("c", { color: "green" }),
    ]);
  });

  it("parses text around and between spans", () => {
    expect(parseInlineMarkup("être → **j'étais** in `dz` speech")).toEqual([
      run("être → "),
      run("j'étais", { bold: true }),
      run(" in "),
      run("dz", { code: true }),
      run(" speech"),
    ]);
  });

  it("prefers bold over italic when markers could overlap", () => {
    expect(parseInlineMarkup("**both**")).toEqual([run("both", { bold: true })]);
  });

  it("leaves an unmatched marker as literal text", () => {
    expect(parseInlineMarkup("2 * 3 = 6")).toEqual([run("2 * 3 = 6")]);
    expect(parseInlineMarkup("**oops")).toEqual([run("**oops")]);
    expect(parseInlineMarkup("<red>oops")).toEqual([run("<red>oops")]);
    expect(parseInlineMarkup("oops</red>")).toEqual([run("oops</red>")]);
  });

  it("keeps a literal marker from splitting the run around it", () => {
    expect(parseInlineMarkup("<green>2 * 3 = 6</green>")).toEqual([
      run("2 * 3 = 6", { color: "green" }),
    ]);
  });

  it("keeps newlines, which a bold span may now cross", () => {
    expect(parseInlineMarkup("**one\ntwo**")).toEqual([
      run("one\ntwo", { bold: true }),
    ]);
  });
});

describe("serialiseRuns", () => {
  it("writes colour outside emphasis", () => {
    expect(
      serialiseRuns([run("hello", { bold: true, italic: true, color: "green" })]),
    ).toBe("<green>**_hello_**</green>");
  });

  it("closes a colour before opening the next", () => {
    expect(
      serialiseRuns([
        run("hello", { bold: true, color: "green" }),
        run("jordan", { bold: true, color: "red" }),
      ]),
    ).toBe("<green>**hello**</green><red>**jordan**</red>");
  });

  it("drops empty runs rather than emitting bare markers", () => {
    expect(serialiseRuns([run(""), run("a")])).toBe("a");
  });

  it("round-trips everything the parser produces", () => {
    const samples = [
      "",
      "just words",
      "**bold** and _italic_",
      "<green>**_hello_<red>jordan</red>**</green>",
      "<blue>a</blue> plain <gold>b</gold>",
      "être → **j'étais** in `dz` speech",
      "<black>line one\nline two</black>",
    ];

    for (const sample of samples) {
      const runs = parseInlineMarkup(sample);
      expect(parseInlineMarkup(serialiseRuns(runs))).toEqual(runs);
    }
  });
});

describe("toPlainText", () => {
  it("is what the teacher sees, with no markers in it", () => {
    expect(toPlainText("<green>**_hello_**</green> there")).toBe("hello there");
  });

  it("keeps an unmatched marker, because it is shown too", () => {
    expect(toPlainText("2 * 3 = 6")).toBe("2 * 3 = 6");
  });
});
