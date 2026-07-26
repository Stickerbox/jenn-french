"use server";

import { getCurrentTeacher } from "@/lib/session";
import {
  CardAiError,
  generateCardSuggestion,
  type SuggestionInput,
} from "@/lib/card-ai";
import type { CardSuggestion } from "@/lib/card-suggestions";

export type SuggestResult =
  | { ok: true; suggestion: CardSuggestion }
  | { ok: false; error: string };

export async function suggestCardFields(
  input: SuggestionInput,
): Promise<SuggestResult> {
  // Without this the route is an unauthenticated endpoint that spends money
  // on the project's API key.
  const teacher = await getCurrentTeacher();
  if (!teacher) return { ok: false, error: "Unauthorized" };

  if (!input.englishPrompt.trim() || !input.frenchAnswer.trim() || !input.subject.trim()) {
    return { ok: false, error: "Fill in all three fields first." };
  }

  try {
    return { ok: true, suggestion: await generateCardSuggestion(input) };
  } catch (err) {
    // CardAiError messages are written for the teacher. Anything else could
    // carry request details, so it never leaves the server.
    if (err instanceof CardAiError) return { ok: false, error: err.message };
    console.error("suggestCardFields failed", err);
    return { ok: false, error: "Claude couldn't be reached. Try again." };
  }
}
