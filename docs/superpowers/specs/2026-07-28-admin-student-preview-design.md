# Live student preview in the card editor — design

Date: 2026-07-28

## Problem

`CardEditor` already looks like a card. It renders a "Front" panel and a "Back"
panel using the same `card-styles.ts` classes the real card uses, so the teacher
edits something card-shaped rather than a stack of labelled inputs.

It is not, however, what the student sees. Four differences, and the first is
the one that matters:

1. **Markup is not rendered.** The editor shows raw text in inputs, so
   `être → **j'étais**` reads with its asterisks. The student sees **j'étais**
   in bold. Claude writes markup into every `hint` and every Grammar section, so
   this is on essentially every card.
2. **No idiom box.** `Flashcard` runs `splitIdiom` on the section titled "Idiom
   of the day" and renders the expression and its meaning in a gold-bordered
   panel. The editor shows an ordinary section.
3. **Empty-body sections vanish for students.** `Flashcard` skips any section
   whose body is blank. In the editor that section is a normal row, so a
   heading typed without a body looks finished and is invisible on the card.
4. **Proportion.** The student card is one 460px-tall face at a time. The editor
   is two panels of whatever height their content needs.

Checking any of this today means saving the card, opening `/g/<slug>` in another
tab, and reloading after every correction.

## Goal

The teacher sees the real student rendering, updating as she types, without
saving and without leaving `/admin`.

## Scope

New:

- `components/CardFront.tsx`, `components/CardBack.tsx` — the two faces, moved
  out of `Flashcard.tsx`
- `components/admin/StudentPreview.tsx` — stacks the two faces for the editor
- `lib/card-preview.ts` — `toPreviewContent`, the `CardInput → CardContent` map
- `tests/lib/card-preview.test.ts`

Changed:

- `components/Flashcard.tsx` — keeps the flip, composes the two faces
- `components/admin/CardEditor.tsx` — two-column grid around the form and the
  preview
- `app/admin/page.tsx`, `app/admin/[slug]/page.tsx` — the page shell widens on
  large screens

Unchanged:

- What students see. The extraction is behaviour-preserving; `/g/[slug]` renders
  the same markup before and after.
- The editor's own Front/Back WYSIWYG panels. They stay exactly as they are.
- Saving, deleting, Generate, sections, auth, dates, the deployment.

## The shape

```
mobile (one column)                desktop ≥ 1024px (two columns)

+---------------------+            +-------------------+  +-------------------+
| Front  [editable]   |            | Front  [editable] |  | AS THE STUDENT    |
| Back   [editable]   |            | Back   [editable] |  | SEES IT           |
|                     |            |                   |  | +---------------+ |
| [    Save card    ] |            | [   Save card   ] |  | | front         | |
|     Delete card     |            |    Delete card    |  | |               | |
+---------------------+            +-------------------+  | +---------------+ |
| AS THE STUDENT      |                                    | | back          | |
| SEES IT             |                                    | |               | |
| +-----------------+ |                                    | +---------------+ |
| | front           | |                                    +-------------------+
| +-----------------+ |                                       sticky, follows
| | back            | |                                       the scroll
| +-----------------+ |
+---------------------+
```

On mobile the preview sits under the Save and Delete buttons, as the last thing
on the editor. On desktop it moves beside the editor and sticks, so it is in
view while she types rather than a scroll away.

## Why the faces get extracted

The preview shows both faces at once with no flip. That is a different layout
from the student card, which shows one face at a time inside a rotating
container — so the preview cannot simply reuse `Flashcard`.

The obvious alternative, writing the preview's markup fresh, was rejected. It
would make a second copy of the idiom box, the markup rendering and the
empty-section filter — the three things the preview exists to show. A preview
that can drift from the card is worse than no preview, because it is trusted.

So `Flashcard` splits in three: the two faces become components, and what is
left is the flip container that arranges them. Each face takes the card and a
`className`, which is how the caller supplies what the layout needs —
`backface-visibility` and the 180° rotation for the flip, a minimum height for
the preview.

```
Flashcard                          StudentPreview
+-----------------------+          +----------------+
| motion.div (rotateY)  |          |  <CardFront/>  |
|   <CardFront/>        |          |  <CardBack/>   |
|   <CardBack/>         |          +----------------+
| [ Flip card ]         |
+-----------------------+
```

The header row — the date and the subject pill — is duplicated between the two
faces. It already is, inside `Flashcard` today; the extraction carries that
duplication across rather than introducing it, and the class strings are already
shared through `card-styles.ts`. Extracting a third component for eight lines of
JSX is not worth the indirection here.

## Data flow

`CardEditor` holds `values: CardInput`, where every field is a `string` because
the fields drive controlled inputs. `CardFront` and `CardBack` take a
`CardContent`, where the optional fields are `string | null` and the date is a
`Date`. One pure function bridges them:

```ts
// lib/card-preview.ts
export function toPreviewContent(values: CardInput): CardContent;
```

| `CardInput` | `CardContent` | Rule |
| --- | --- | --- |
| `date: string` | `date: Date` | parsed as UTC midnight, as every date in this app is |
| `subject: string` | `subject: string \| null` | `value \|\| null` — no trim |
| `usage: string` | `usage: string \| null` | `value \|\| null` — no trim |
| `hint: string` | `hint: string \| null` | `value \|\| null` — no trim |
| `englishPrompt` | `englishPrompt` | unchanged |
| `frenchAnswer` | `frenchAnswer` | unchanged |
| `sections` | `sections` | `normaliseSections` |

The three scalars are deliberately **not** trimmed, because `toCreateData` and
`toUpdateData` in `app/actions.ts` do not trim them either — they use
`input.subject || null`. A subject of `"   "` is truthy, so it saves, and the
student card renders a pill containing spaces. A trimming preview would show no
pill and be wrong. The mapping mirrors the save path exactly rather than
mirroring what the save path arguably ought to do; making the save path trim is
a separate change to a separate file, and out of scope here.

Sections are the exception, and only because the save path is the exception:
`normaliseSections` runs on both paths, so trimming there is faithful.

This belongs in `lib/` and gets tested because the `"" → null` rule is a real
rule, not plumbing: it decides whether the subject pill, the usage line and the
hint appear on the card at all. An empty string would render an empty pill; a
null renders nothing.

`normaliseSections` is deliberate. It is the same function the save path runs, so
the preview shows what saving would store rather than what is loosely typed —
including trimming, so trailing whitespace does not make a blank section look
real.

The date needs no validation. It comes from `initialDate`, which the pages get
from `parseAdminDate`, which only ever returns a valid `YYYY-MM-DD`.

**Real time needs no machinery.** `values` is React state already updated on
every keystroke, and the preview is a pure function of it. No debounce, no
effect, no second copy of the state, nothing to keep in sync. The mapping is a
trim of four strings and a pass over three or four sections; it runs inside a
render that was happening anyway.

## Layout

`CardEditor`'s editing stage wraps the form and the preview:

```
mx-auto grid w-full max-w-[560px] gap-8
lg:max-w-[1152px] lg:grid-cols-2 lg:items-start
```

1152 − 32 of gap = 1120, halved = **560** — exactly the width the editor is
today. On desktop the editor column does not change size or position relative to
its own content; the preview appears beside it. Below `lg` the grid collapses to
one column and the preview follows the buttons, which is where it was asked for.

The preview is `lg:sticky lg:top-8`, so it stays put while the editor scrolls.
`lg:items-start` on the grid keeps the sticky child from being stretched to the
row height, which would stop it sticking.

Both admin pages currently wrap everything in `mx-auto max-w-xl`, which would
clamp the wider grid. Each becomes `mx-auto max-w-xl lg:max-w-[1152px]`. Only
`CardEditor` uses that extra width; every sibling stays narrow.

The siblings cannot simply keep `mx-auto`. Centring a 560px block inside a
1152px container puts it over the seam between the two columns, so the date
picker would float into the middle with the editor starting under its left half.
On large screens the narrow blocks are therefore **left-aligned** to share the
editor column's left edge:

```
mx-auto w-full max-w-[560px] lg:mx-0
```

Below `lg` the container is itself `max-w-xl`, so `mx-auto` centres as it does
today and `lg:mx-0` never applies. `max-w-[560px]` rather than `max-w-xl`
because 560 is the editor column's exact width; `max-w-xl` is 576 and would sit
8px proud of it.

| Page | Blocks that get the wrapper |
| --- | --- |
| `/admin` | the heading + Log out row, `AdminDatePicker`, the Groups heading, `NewGroupForm`, `GroupList` |
| `/admin/[slug]` | the heading, `AdminDatePicker`, the Existing overrides heading and list |

`AdminDatePicker`, `NewGroupForm` and `GroupList` accept no `className` prop, so
each is wrapped in a `div` rather than given a class. None of the three changes.
`AdminDatePicker` keeps its own internal `mx-auto max-w-[560px]`, which inside a
560px wrapper is a no-op.

The preview's label reuses `panelLabel`, which applies `uppercase` in CSS, so the
source text is sentence case — **"As the student sees it"** — and renders in the
same small caps mono style as "Front" and "Back".

Each face gets `min-h-[460px]` in the preview. The flip container supplies that
height on the student page, so without it the preview's proportions would be
wrong on exactly the cards where proportion matters — the short ones.

## Deliberate behaviours

**The preview appears only in the `editing` stage.** The `compose` stage is three
inputs and a Generate button, with no hint, no sections and no card to preview.

**"tap to reveal the answer" stays on the front face.** It is on the student's
card, so it is in the preview. Suppressing it would be the first small lie, and
the value of this feature is that it does not lie.

**A title-only section visibly disappears.** That is difference 3 from the
Problem section working as intended. It is the point, not a bug to fix.

**No flip button, no tap-to-flip.** The preview is not the `Flashcard` wrapper;
it is two faces. Both are always visible, which is what makes it worth having
beside the editor.

**The trailing placeholder cannot leak in.** `SectionEditor` keeps its empty
"Add new section" row outside `values.sections`, so nothing extra is passed.

## Testing

`tests/lib/card-preview.test.ts` covers `toPreviewContent`:

- each of `subject`, `usage` and `hint`: a value survives, `""` becomes `null`,
  and whitespace-only survives as itself — the test that pins the mapping to the
  untrimmed save path in `app/actions.ts`
- `englishPrompt` and `frenchAnswer` pass through untouched, including when blank
- the date string becomes the correct UTC `Date`
- sections are trimmed, sections blank in both fields are dropped, and a
  title-only section survives the mapping — `CardBack` is what hides it, not this
- section order is preserved

No jsdom and no React Testing Library. Vitest here is `environment: "node"` and
this repo tests pure logic only; adding component-test infrastructure is a larger
decision than this feature should make on its own. The rest is verified by
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and by running
the app.

Manual checks that matter:

1. **`/g/[slug]` is unchanged after the extraction** — same card, front and back,
   flip included. This is the only change that touches students, so it is checked
   first and against a real card.
2. Typing `**bold**` into a section body shows bold in the preview and asterisks
   in the editor.
3. The Idiom of the day section renders in the gold box in the preview; renaming
   it removes the box, matching the student card.
4. Clearing a section's body makes it disappear from the preview while its
   editor row stays.
5. Clearing the subject removes the pill rather than leaving an empty one.
6. At ≥1024px the preview sits beside the editor and stays in view while
   scrolling; below that it sits under the Delete card button.
7. Generate on a blank date shows no preview until it succeeds, then shows one.
8. At ≥1024px the date picker, headings and Groups/overrides lists are still
   560px wide and share a left edge with the editor column — nothing floats to
   the middle of the wider container.
9. Below 1024px both admin pages look exactly as they do today.

## Out of scope

A flip in the preview, previewing as a specific group, a device-size toggle
(phone/desktop frames), previewing the archive or week picker around the card,
collapsing the preview, and any change to what students see. The last one is a
constraint rather than a deferral: if `/g/[slug]` renders differently after this,
the change is wrong.
