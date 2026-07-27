import type { CardInput } from "@/app/actions";
import { seedSections } from "@/lib/sections";

// The three fields Claude writes. The Québec pronunciation is deliberately
// absent — the teacher writes it, and leaving it out of this type means there
// is no shape in which a generated value could reach the form.
export type CardSuggestion = {
  hint: string;
  grammar: string;
  idiom: string;
};

export function applySuggestion(
  values: CardInput,
  suggestion: CardSuggestion,
): CardInput {
  return {
    ...values,
    hint: suggestion.hint,
    sections: seedSections(suggestion.grammar, suggestion.idiom),
  };
}
