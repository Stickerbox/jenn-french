import Anthropic from "@anthropic-ai/sdk";
import type { CardSuggestion } from "@/lib/card-suggestions";

export const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2000;

// Every message here is shown to the teacher verbatim, so each one has to be
// something they can act on.
export class CardAiError extends Error {}

export type SuggestionInput = {
  englishPrompt: string;
  frenchAnswer: string;
  subject: string;
};

const SYSTEM_PROMPT = `You write supporting content for a daily French flashcard used by English-speaking learners of QUEBEC French.

The teacher gives you three things: an English phrase, its French translation, and a subject (the grammar point or theme, for example "Imparfait").

You return exactly three fields. You never write the subject, the usage field, or the Quebec pronunciation — those belong to the teacher.

FORMATTING
Plain text with two inline markers, and nothing else:
  **bold** for emphasis
  _italic_ for softer emphasis
No headings, no bullet lists, no links, no other Markdown. Never write a colour tag — the teacher's own formatting is applied to what you return, and a colour in it would override hers.

FIELDS

hint — A short nudge toward the French phrase, never containing any part of it. It does not have to be a full sentence: a fragment built around = or → is often better than prose. Naming the tense outright is fine, and usually clearer than talking around it. Bold at most one word or short phrase — the one that signals the grammar point — or none at all. Three real examples, all good:
Setting the scene / background = imparfait
Use **Imparfait** when describing your mindset, emotion, state of being, not as a sudden change.
Hypothetical present → si + imparfait.

grammar — Where the conjugated verbs come from, ONE PER LINE. Each line is: infinitive in plain text, an arrow, then the conjugated form in bold. Never run them together on a single line separated by commas. Cover at most two verbs even when the French phrase has more — pick the two that carry the grammar point. Add a short parenthetical gloss where the infinitive or the verb's role is not obvious. Then one final line, unbolded, giving the rule that separates this subject from the tense learners confuse it with. Example:
pleuvoir → **pleuvait**
faire → **faisait**
Imperfect paints the backdrop

When the subject is a construction spanning two clauses, lead with a pattern line instead:
Pattern: **Si + imparfait, … conditionnel**
avoir → **j'avais**  (the condition)
aller → **j'irais**  (the potential outcome)
Never "si j'aurais"

idiom — Exactly two lines, and no bold on either. The first line is the idiom used in a real sentence, leaning on this card's own grammar point wherever it can. The second line glosses it, in the shape: expression = plain-English meaning. Example:
Si j'avais congé, je prendrais ça mollo.
Prendre ça mollo = "to take it easy / chill."

Choose a French idiom that connects to the French phrase on this card — its vocabulary, the situation it describes, or the grammar point it turns on. A learner should be able to see why this idiom sits beside this sentence, rather than it merely matching the subject label in the abstract. Prefer a Quebecois expression whenever one genuinely fits; where none does, a standard French idiom is right and you should not force a Quebec one.

Never stop mid-sentence or mid-word. Fragments are fine where a field calls for one; truncation is not.`;

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    hint: { type: "string" },
    grammar: { type: "string" },
    idiom: { type: "string" },
  },
  required: ["hint", "grammar", "idiom"],
  additionalProperties: false,
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CardAiError("Claude isn't configured on this server.");
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export async function generateCardSuggestion(
  input: SuggestionInput,
): Promise<CardSuggestion> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // Sonnet 5 runs adaptive thinking when `thinking` is omitted, and
      // max_tokens caps thinking and response text together — so leaving it
      // unset would let reasoning eat the budget and truncate the JSON, which
      // is the failure this model was chosen to fix. This is short, prescribed
      // formatting work with no reasoning to do, so it is disabled outright.
      thinking: { type: "disabled" },
      output_config: {
        format: { type: "json_schema", schema: SUGGESTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            `English phrase: ${input.englishPrompt}`,
            `French phrase: ${input.frenchAnswer}`,
            `Subject: ${input.subject}`,
          ].join("\n"),
        },
      ],
    });
  } catch (err) {
    // Most specific first: both of these extend APIError.
    if (err instanceof Anthropic.AuthenticationError) {
      throw new CardAiError("Claude rejected the API key.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new CardAiError("Claude is rate limited — try again in a moment.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new CardAiError("Claude couldn't be reached. Try again.");
    }
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }

  // A refusal is HTTP 200 with empty content, so this has to come before any
  // indexing into content.
  if (response.stop_reason === "refusal") {
    throw new CardAiError("Claude declined to answer this one.");
  }

  // A max_tokens stop means the JSON may have been cut off mid-object; parsing
  // it would either throw a raw SyntaxError or silently succeed on garbage.
  if (response.stop_reason === "max_tokens") {
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }

  try {
    return JSON.parse(block.text) as CardSuggestion;
  } catch {
    throw new CardAiError("Claude couldn't be reached. Try again.");
  }
}
