import type { CardInput } from "@/app/actions";

// The five fields Claude writes. Subject and usage are deliberately absent:
// the teacher owns those, and leaving them out of this type means there is no
// shape in which a generated value for them could reach the form.
export type CardSuggestion = {
  hint: string;
  examples: string;
  pronunciation: string;
  tip: string;
  idiom: string;
};

export function applySuggestion(
  values: CardInput,
  suggestion: CardSuggestion,
): CardInput {
  return {
    ...values,
    hint: suggestion.hint,
    examples: suggestion.examples,
    pronunciation: suggestion.pronunciation,
    tip: suggestion.tip,
    idiom: suggestion.idiom,
  };
}
