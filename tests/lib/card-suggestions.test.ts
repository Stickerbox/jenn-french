import { describe, it, expect } from "vitest";
import { applySuggestion, type CardSuggestion } from "@/lib/card-suggestions";
import type { CardInput } from "@/app/actions";

const composed: CardInput = {
  date: "2026-07-26",
  subject: "Imparfait",
  usage: "",
  pronunciation: "",
  englishPrompt: "I used to pack a lunch every day",
  hint: "",
  frenchAnswer: "Je faisais un lunch chaque jour",
  examples: "",
  tip: "",
  idiom: "",
};

const suggestion: CardSuggestion = {
  hint: "Think **every day** — a repeated habit.",
  examples: "faire → **faisait**.",
  pronunciation: "**Lunch** `lonch` is the QC word.",
  tip: "Everyday register.",
  idiom: "**se pogner le beigne** — to laze about",
};

describe("applySuggestion", () => {
  it("sets the five generated fields", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.hint).toBe(suggestion.hint);
    expect(result.examples).toBe(suggestion.examples);
    expect(result.pronunciation).toBe(suggestion.pronunciation);
    expect(result.tip).toBe(suggestion.tip);
    expect(result.idiom).toBe(suggestion.idiom);
  });

  it("carries the teacher's fields through untouched", () => {
    const result = applySuggestion(composed, suggestion);
    expect(result.date).toBe("2026-07-26");
    expect(result.subject).toBe("Imparfait");
    expect(result.englishPrompt).toBe(composed.englishPrompt);
    expect(result.frenchAnswer).toBe(composed.frenchAnswer);
  });

  it("leaves usage blank, since nothing generates it", () => {
    expect(applySuggestion(composed, suggestion).usage).toBe("");
  });

  it("does not mutate the values it was given", () => {
    applySuggestion(composed, suggestion);
    expect(composed.hint).toBe("");
    expect(composed.examples).toBe("");
  });
});
