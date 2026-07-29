import { describe, it, expect } from "vitest";
import { applySuggestion, type CardSuggestion } from "@/lib/card-suggestions";
import { PRONUNCIATION_TITLE, TIP_TITLE } from "@/lib/sections";
import type { CardInput } from "@/app/actions";

const composed: CardInput = {
  date: "2026-07-27",
  subject: "Imparfait",
  usage: "",
  englishPrompt: "I used to pack a lunch every day",
  hint: "",
  frenchAnswer: "Je faisais un lunch chaque jour",
  sections: [],
};

const suggestion: CardSuggestion = {
  hint: "Think **every day** — a repeated habit.",
  grammar: "faire → **faisait**.",
  idiom: "**se pogner le beigne** — to laze about",
};

describe("applySuggestion", () => {
  it("sets the hint", () => {
    expect(applySuggestion(composed, suggestion).hint).toBe(suggestion.hint);
  });

  it("seeds four sections in order", () => {
    expect(
      applySuggestion(composed, suggestion).sections.map((s) => s.title),
    ).toEqual([
      "Grammar",
      PRONUNCIATION_TITLE,
      TIP_TITLE,
      "Idiom of the day",
    ]);
  });

  it("puts Claude's text in Grammar and Idiom, and leaves the teacher's two empty", () => {
    const [grammar, pronunciation, tip, idiom] = applySuggestion(
      composed,
      suggestion,
    ).sections;
    expect(grammar.body).toBe(suggestion.grammar);
    expect(pronunciation.body).toBe("");
    expect(tip.body).toBe("");
    expect(idiom.body).toBe(suggestion.idiom);
  });

  it("carries the teacher's fields through untouched", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.date).toBe("2026-07-27");
    expect(result.subject).toBe("Imparfait");
    expect(result.englishPrompt).toBe(composed.englishPrompt);
    expect(result.frenchAnswer).toBe(composed.frenchAnswer);
  });

  it("does not mutate the values it was given", () => {
    applySuggestion(composed, suggestion);
    expect(composed.hint).toBe("");
    expect(composed.sections).toEqual([]);
  });
});
