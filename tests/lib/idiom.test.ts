import { describe, it, expect } from "vitest";
import { splitIdiom } from "@/lib/idiom";

// Verbatim from the production cards. These are the shape the teacher
// actually writes — an example sentence, then the gloss under it — and they
// are the reason the line break outranks every other separator.
describe("splitIdiom, on the teacher's own idioms", () => {
  it("splits on the line break, not on a dash inside the first line", () => {
    expect(
      splitIdiom(
        "sur la galerie “on the porch/balcony” — galerie is the homey QC word \nEx. J'étais assis sur la galerie.",
      ),
    ).toEqual({
      expression: "sur la galerie “on the porch/balcony” — galerie is the homey QC word",
      meaning: "Ex. J'étais assis sur la galerie.",
    });
  });

  it("keeps both halves of a two-sentence idiom", () => {
    expect(
      splitIdiom(
        "J'étais à boutte.  = I was wiped out.\nJ'étais au bout du rouleau. = I was at the end of my rope.",
      ),
    ).toEqual({
      expression: "J'étais à boutte.  = I was wiped out.",
      meaning: "J'étais au bout du rouleau. = I was at the end of my rope.",
    });
  });

  it("makes the example sentence the expression and the gloss the meaning", () => {
    expect(
      splitIdiom(
        "Si j’avais congé, je prendrais ça mollo. \nPrendre ça mollo = “to take it easy / chill.”",
      ),
    ).toEqual({
      expression: "Si j’avais congé, je prendrais ça mollo.",
      meaning: "Prendre ça mollo = “to take it easy / chill.”",
    });
  });

  it("still reads the one-line shape she used on her first card", () => {
    expect(
      splitIdiom(
        "**Y faisait ben fret** — it was **really cold**. A quintessential QC way to describe harsh winter mornings.",
      ),
    ).toEqual({
      expression: "Y faisait ben fret",
      meaning:
        "it was **really cold**. A quintessential QC way to describe harsh winter mornings.",
    });
  });

  it("drops the ** delimiter when it wraps a whole first line", () => {
    expect(splitIdiom("**partir en camping**\n“to go camping”")).toEqual({
      expression: "partir en camping",
      meaning: "“to go camping”",
    });
  });

  it("keeps emphasis she chose herself, once the line carries a colour", () => {
    expect(splitIdiom("<red>**shouted**</red>\ngloss")).toEqual({
      expression: "<red>**shouted**</red>",
      meaning: "gloss",
    });
  });
});

describe("splitIdiom", () => {
  it("splits the format Claude is asked to produce", () => {
    expect(splitIdiom("**sur la galerie** — on the porch/balcony")).toEqual({
      expression: "sur la galerie",
      meaning: "on the porch/balcony",
    });
  });

  it("keeps later dashes in the meaning, splitting only at the first", () => {
    expect(
      splitIdiom(
        '**sur la galerie** — "on the porch/balcony" — galerie is the homey QC word for an outdoor deck.',
      ),
    ).toEqual({
      expression: "sur la galerie",
      meaning:
        '"on the porch/balcony" — galerie is the homey QC word for an outdoor deck.',
    });
  });

  it("falls back to the first dash when the teacher removed the emphasis", () => {
    expect(splitIdiom("se pogner le beigne — to laze about")).toEqual({
      expression: "se pogner le beigne",
      meaning: "to laze about",
    });
  });

  it("accepts an en dash or a hyphen as the separator", () => {
    expect(splitIdiom("**avoir de la misère** – to have a hard time")).toEqual({
      expression: "avoir de la misère",
      meaning: "to have a hard time",
    });
    expect(splitIdiom("**être à boutte** - to be exhausted")).toEqual({
      expression: "être à boutte",
      meaning: "to be exhausted",
    });
  });

  it("treats a bare expression as the expression, with no meaning", () => {
    expect(splitIdiom("**pantoute**")).toEqual({
      expression: "pantoute",
      meaning: "",
    });
  });

  it("never drops text when there is no separator at all", () => {
    expect(splitIdiom("just some words with no separator")).toEqual({
      expression: "just some words with no separator",
      meaning: "",
    });
  });

  it("does not split on a hyphen inside a word", () => {
    expect(splitIdiom("un p'tit quelque-chose")).toEqual({
      expression: "un p'tit quelque-chose",
      meaning: "",
    });
  });

  it("returns empty parts for an empty string", () => {
    expect(splitIdiom("")).toEqual({ expression: "", meaning: "" });
    expect(splitIdiom("   ")).toEqual({ expression: "", meaning: "" });
  });
});
