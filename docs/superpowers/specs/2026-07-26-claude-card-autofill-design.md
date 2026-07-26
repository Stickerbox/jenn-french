# Claude card autofill — design

Date: 2026-07-26

## Problem

Authoring a card means filling ten fields by hand. Seven of them — subject,
usage, pronunciation, hint, grammar, tip, idiom — are supporting material that
follows mechanically from the two that carry the teaching: the English prompt
and the French answer. Writing them out every day is the slow part of making a
card, and it is the part where a draft to react to beats a blank field.

## Goal

Add a button to the card editor that sends the English prompt and the French
answer to Claude, and fills the seven supporting fields with what comes back.
The teacher keeps authorial control: nothing they typed is ever overwritten,
and every generated field is editable before saving.

## Scope

New:

- `lib/card-ai.ts` — Anthropic client, prompt, and the structured-output call
- `lib/card-suggestions.ts` — the pure merge rule
- `app/ai-actions.ts` — the server action, behind the teacher session gate
- `tests/lib/card-suggestions.test.ts`

Changed:

- `components/admin/CardEditor.tsx` — button, request state, merge on success
- `package.json` — adds `@anthropic-ai/sdk`
- `../Winery/WEBSITE_TEMPLATE.md` — `ANTHROPIC_API_KEY` row in the env var table

Unchanged:

- The `CardInput` type and both upsert server actions
- The Prisma schema — nothing about generated content is persisted differently
  from hand-typed content
- The student-facing card at `/g/[slug]`

## What Claude fills

The teacher writes the two fields that define the card. Claude proposes the
seven that support it.

| Field | Written by | Notes |
| --- | --- | --- |
| date | teacher | not sent to Claude |
| englishPrompt | teacher | input |
| frenchAnswer | teacher | input |
| subject | Claude | short pill label, e.g. "Imparfait" |
| usage | Claude | one italic gloss, e.g. "Habits of the past" |
| pronunciation | Claude | Québec pronunciation note |
| hint | Claude | nudge toward the answer, never the answer itself |
| examples | Claude | the "Grammar" section |
| tip | Claude | the "Tip" section |
| idiom | Claude | `expression — meaning` shape |

The button is disabled until both `englishPrompt` and `frenchAnswer` are
non-empty. Sending one without the other gives Claude too little to work from,
and the failure would be silent — a plausible card built around a sentence the
teacher did not mean.

## Merge rule

`mergeSuggestions(values, suggestion)` returns a new `CardInput`. For each of
the seven supporting fields, the suggested value is written **only if the
current value is empty or whitespace**. Every other field, including the two
inputs and the date, is passed through untouched.

This is the whole of the fill behaviour. Consequences worth stating:

- Regenerating never destroys an edit. A field the teacher has touched is
  invisible to the merge from then on.
- To redo a single field, clear it and press the button again.
- To redo everything, clear the seven fields and press the button.

Whitespace counts as empty, so a field containing only a stray space still gets
filled — otherwise a field would look blank and refuse to fill, with nothing on
screen to explain why.

## Language and voice

Content targets **Québécois** French for an English-speaking learner. This is
not a preference bolted on; it is what the card already is. The back panel
labels its section "Québec Pronunciation", and the idiom placeholder in the
editor reads "faire un lunch — to pack a lunch".

The system prompt describes each field in the terms the card UI uses, so the
generated text matches the register of the fields around it — `usage` as a
short gloss rather than a sentence, `idiom` in the `expression — meaning`
shape, `hint` as a nudge that does not give the answer away.

## The Claude call

```
model       claude-haiku-4-5
max_tokens  2000
output_config.format   json_schema, the seven fields
```

Model choice: the task is short, tightly specified, returns structured output,
and every field is reviewed by a human before it is saved. Haiku 4.5 fits that
profile. `MODEL` is a single exported constant in `lib/card-ai.ts` — moving to
`claude-sonnet-5` is a one-line change if the output quality disappoints.

Three details specific to this model:

- **No `output_config.effort`.** The effort parameter is Opus 4.5 and later;
  sending it to Haiku 4.5 is a 400. Only `output_config.format` is set.
- **No thinking configuration.** Omitting `thinking` on Haiku 4.5 means no
  thinking, which is right for a task this size. If the model constant changes
  to Sonnet 5, thinking becomes adaptive-by-default and `effort` becomes
  available — both would need revisiting at that point, and `max_tokens` would
  need to cover thinking as well as the JSON.
- **No prompt caching.** The minimum cacheable prefix on Haiku 4.5 is 4096
  tokens. The system prompt does not come close, so a `cache_control` marker
  would silently do nothing.

Structured outputs (`output_config.format`) are supported on Haiku 4.5 and
guarantee the response parses against the schema, so there is no text parsing
to get wrong. The schema declares all seven fields as required strings with
`additionalProperties: false`. Claude is instructed to fill every one; the
teacher deletes anything they do not want, which is cheaper than the model
guessing at which fields to omit.

The call uses the GA `client.messages.create` — structured outputs are not a
beta feature and no beta header is involved.

## Error handling

Errors surface next to the button in their own state slot, kept separate from
the existing save error so the two cannot be confused.

| Cause | Message |
| --- | --- |
| `ANTHROPIC_API_KEY` unset | Claude isn't configured on this server. |
| `stop_reason === "refusal"` | Claude declined to answer this one. |
| `AuthenticationError` | Claude rejected the API key. |
| `RateLimitError` | Claude is rate limited — try again in a moment. |
| `APIError` (any other) | Claude couldn't be reached. Try again. |

Caught most-specific-first, using the SDK's typed exception classes rather than
string-matching messages. `stop_reason` is checked before reading
`response.content`, because a refusal returns HTTP 200 with empty content and
indexing into it would throw.

The server action never leaks the underlying error text to the client — the
messages above are the entire surface. A stack trace from the SDK could carry
request details, and the teacher can act on none of it.

The `fallbacks` parameter is deliberately not used. It exists for models with
elevated safety classifiers, and would pull the call onto the beta endpoint to
handle a refusal path that will not fire for French flashcards.

## Key handling

`ANTHROPIC_API_KEY` lives in `.env.local`, which is already gitignored, and is
read only inside `lib/card-ai.ts` — a module reached exclusively through a
server action. It is never prefixed `NEXT_PUBLIC_` and never referenced from a
client component, so it cannot reach the browser bundle.

`WEBSITE_TEMPLATE.md` records this key being scraped from a compromised EC2
instance twice, both times generating unexpected charges. Two consequences for
this feature:

1. Use a key issued for this project alone, so rotating it costs nothing
   elsewhere.
2. Add the variable to the env var table and the fresh-instance deploy steps in
   `WEBSITE_TEMPLATE.md`, so a rebuild does not come up with the feature
   silently broken.

The server action calls `requireTeacher()` before anything else, matching every
write in `app/actions.ts`. Without it the endpoint would be an unauthenticated
route that spends money on the project's API key.

## Testing

The vitest suite covers pure logic only; there is no React Testing Library
setup and no HTTP mocking layer, and adding either is a larger change than this
feature warrants. The merge rule is where the logic that can be wrong lives, so
that is what gets tested:

- fills a blank field from the suggestion
- leaves a field the teacher typed untouched
- treats a whitespace-only field as blank
- passes date, englishPrompt, and frenchAnswer through unchanged

No test makes a live API call.

Everything else is verified with `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`, and by running the app.

Manual checks that matter:

1. Generate on an empty card from `/admin`, then save, then reopen — the
   generated values persist like hand-typed ones.
2. Type a `tip` by hand, generate, and confirm the tip survives while the other
   six fields fill.
3. Generate on `/admin/[slug]`, confirming the override path behaves identically.
4. Unset `ANTHROPIC_API_KEY` and confirm the button reports configuration
   trouble instead of throwing.

## Out of scope

No preview-and-accept panel, no per-field regenerate buttons, no streaming, no
storing of prompts or responses, no usage metering. Each is a reasonable thing
to want later; none is needed to find out whether the generated cards are good
enough to use.
