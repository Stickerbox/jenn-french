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
Plain text with three inline markers, and nothing else:
  **bold** for emphasis
  *italic* for softer emphasis
  \`code\` for phonetic renderings and spoken forms
No headings, no bullet lists, no links, no other Markdown. Never nest markers.

FIELDS

hint — One sentence nudging the learner toward the French phrase without containing any part of it. Bold the trigger word that signals the grammar point.

grammar — The grammar note. Show where each conjugated verb in the French phrase comes from: infinitive in plain text, an arrow, then the conjugated form in bold. Finish with one short sentence giving the rule that separates this subject from the tense learners confuse it with. Example:
être → **j'étais**, faire → **faisait**, conduire → **conduisait**. Repeated "would" = imparfait, not conditionnel.

idiom — Exactly one line, in this shape: **expression** — plain-English meaning. The expression must be in bold, and it must come first.
Choose a French idiom that connects to the French phrase on this card — its vocabulary, the situation it describes, or the grammar point it turns on. A learner should be able to see why this idiom sits beside this sentence, rather than it merely matching the subject label in the abstract. Prefer a Quebecois expression whenever one genuinely fits; where none does, a standard French idiom is right and you should not force a Quebec one.

Every field must be a complete, finished sentence. Never stop mid-sentence or mid-word.`;

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
