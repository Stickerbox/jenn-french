# Admin card editor — design

Date: 2026-07-26

## Problem

The admin page authors a flashcard through a stack of labelled text fields
(`components/admin/CardForm.tsx`). The teacher cannot see what the card will
look like while writing it, and the form gives no sense of which text lands on
the front of the card and which lands on the back.

## Goal

Replace the form with an editable rendering of the card itself: two panels
stacked vertically, front on top and back below, styled like the student card.
The teacher clicks the text where it will appear, types, and saves.

## Scope

Changes:

- `components/admin/CardForm.tsx` — replaced by `components/admin/CardEditor.tsx`
- `components/Flashcard.tsx` — shared style constants extracted, no behaviour change
- `app/admin/page.tsx`, `app/admin/[slug]/page.tsx` — import and tag change only

Unchanged:

- Server actions `upsertGlobalCard` and `upsertOverrideCard`, and the `CardInput` type
- The Groups list and New group form on `/admin`
- The "Existing overrides" list on `/admin/[slug]`
- The student-facing card at `/g/[slug]`

## Layout

```
Date * [ 2026-07-26 ]        <- labelled input, a normal form control

FRONT
+---------------------------------+
| SAM 26 JUIL          ( Subject )|
| Usage                           |
| SAY IT IN FRENCH *              |
| English prompt                  |
| Hint                            |
+---------------------------------+

BACK
+---------------------------------+
| SAM 26 JUIL          ( Subject )|
| THE ANSWER *                    |
| French answer                   |
| GRAMMAR                         |
| QUEBEC PRONUNCIATION            |
| TIP                             |
| IDIOM OF THE DAY                |
+---------------------------------+

[ Save card ]
```

The panels do not flip. There is no perspective transform, no framer-motion
animation, no "tap to reveal the answer" line, and no Flip button. Each panel
carries the same border, paper background, accent bar, drop shadow, and dashed
header rule as the student card, plus a small mono `FRONT` / `BACK` label above
it so the stack reads unambiguously.

## Field mapping

Mirrors `components/Flashcard.tsx` so the editor is a faithful preview.

Front panel:

| Field | Placement | Required |
| --- | --- | --- |
| date | header left, read-only label derived from the Date input | yes |
| subject | header right, inside the pill | no |
| usage | italic line above the prompt | no |
| englishPrompt | body | yes |
| hint | italic line below the prompt | no |

Back panel:

| Field | Placement | Required |
| --- | --- | --- |
| date | header left, read-only label | yes |
| subject | header right, inside the pill | no |
| frenchAnswer | body, under "THE ANSWER" | yes |
| examples | "GRAMMAR" section | no |
| pronunciation | "QUEBEC PRONUNCIATION" section | no |
| tip | "TIP" section | no |
| idiom | "IDIOM OF THE DAY" section | no |

The date and subject appear on both panels, exactly as on the student card.
Editing either one in one panel updates the other, because both read the same
piece of state.

Every back-panel section heading renders in the editor even when its field is
empty — otherwise there would be no way to add a tip or an idiom to a card that
does not have one yet. Blank optional fields continue to hide themselves on the
student card; that logic already lives in `Flashcard.tsx` and does not change.

## Required fields

Only three fields are required: `date`, `englishPrompt`, and `frenchAnswer`.
Their labels carry a trailing `*` (`Date *`, `SAY IT IN FRENCH *`,
`THE ANSWER *`). No other label carries a marker, and no other field blocks a
save. This matches the server actions, where every column except `date`,
`englishPrompt`, `frenchAnswer`, and `examples` is nullable.

The `*` is decorative; the accessible requirement comes from the `required`
attribute on the underlying control.

## Editing primitive

A single `EditableText` component backs every editable region:

- Renders a `textarea` for multi-line fields (`englishPrompt`, `frenchAnswer`,
  `examples`, `idiom`) and an `input` for single-line fields (`subject`,
  `usage`, `hint`, `pronunciation`, `tip`).
- Styled `bg-transparent`, no border, no focus ring, `resize-none`, full width,
  and inherits the typography class of the surrounding card region, so the text
  looks identical to the rendered card.
- Textareas auto-grow to fit their content rather than scrolling.
- An empty field shows a muted placeholder written in the card's voice
  ("Add a hint…", "Idiom of the day…").
- Hover shows a faint tinted background; focus adds a dashed underline in
  `var(--card-line)`. These are the only affordances signalling editability.

## Save behaviour

`CardEditor` keeps the props contract of the component it replaces:

```ts
{
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
}
```

It holds the same `values` / `saving` / `error` state as before, submits the
whole `CardInput` on Save, and calls `router.refresh()` on success. If a
required field is empty, native form validation blocks the submit; the save
error message renders below the Save button, in the same place as today.

## Shared styling

The class strings repeated between the student card and the editor — panel
shell, accent bar, header row, section heading — move into
`components/card-styles.ts` and are imported by both `Flashcard.tsx` and
`CardEditor.tsx`. This keeps the editor from drifting away from the real card.
`Flashcard` renders identically before and after this extraction.

The date-label formatter currently defined inside `Flashcard.tsx` moves to
`lib/format.ts` so both components share it and it can be unit tested.

## Testing

The vitest suite in this repo covers pure logic only; there is no React Testing
Library setup, and adding one is a larger change than this feature warrants. So:

- Unit test the extracted date-label formatter in `tests/lib/`.
- Verify the rest with `npm run typecheck`, `npm run lint`, `npm run build`, and
  by running the app to save a card from both `/admin` and `/admin/[slug]`.

Manual checks that matter:

1. A card saved with only the required fields filled renders correctly for a
   student, with no empty section headings.
2. Re-opening the editor for an existing card shows its saved values in place.
3. Changing the Date input updates the date label on both panels.
