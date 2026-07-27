import { describe, it, expect } from "vitest";
import { splitIdiom } from "@/lib/idiom";

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
