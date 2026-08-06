# Lilac palette, browser-chosen language, and a UI refresh — 2026-08-06

Seven items from the owner, delivered in six tasks. The implementation plan is
`docs/superpowers/plans/2026-08-06-lilac-i18n-and-ui-refresh.md`.

## The language rule, and what it retires

Until now the split was deliberate and documented: a student's page was French
because they are learning French, and Jenn's admin was English. That rule is
gone. Language follows `Accept-Language` on **both** surfaces, with French as
the fallback.

The owner was asked directly, because the request conflicted with itself: item 6
wanted an English *Admin* and *Hello Jenn!*, and Jenn is from Montreal, so her
browser may well be `fr-CA`. The answer was one rule with no exceptions. The
consequence is therefore explicit rather than accidental: **those two strings
are translations, not fixed labels**, and Jenn on a French browser gets the
French ones.

French is the fallback for every unresolved case — a missing header, `*`, a
language we do not carry — because this is a French tutor's site and an unknown
visitor should arrive in the language the content is in.

**There is no switcher**, by the owner's choice. The cost is stated rather than
hidden: a wrong browser setting cannot be corrected from inside the site.

### The parser

`pickLocale` (`lib/i18n.ts`) answers `"en"` only when an English entry
**strictly outranks** French, so `"en;q=0.8,fr;q=0.9"` correctly resolves to
French despite English coming first in the string. A malformed q-value discards
its entry rather than defaulting to 1 — `"en;q=banana"` resolves to French. That
is the trap a naive parser falls into, and it has a test.

### The boundary bug, which is the thing to remember

Interpolating values in `lib/strings.ts` are **functions**, not placeholder
templates, because French and English disagree about word order (*Marie's page*
/ *La page de Marie*) and a placeholder scheme invites building sentences by
concatenation.

The plan then said server components should resolve the strings and pass the
object to client components. **Those two rules are incompatible.** React cannot
serialize a function across the server/client boundary, and every affected page
threw a 500.

It shipped because `npm run lint`, `npx tsc --noEmit`, `npm test` **and**
`npm run build` all passed. None of them renders a request through the RSC
boundary. The error is runtime-only, and it was found by running the app.

The fix is that the **locale** crosses, never the resolved object: a client
component takes `locale: Locale` and calls `getStrings(locale)` itself. Every
call site inside a component body is unchanged, and the RSC payload shrinks.
`lib/strings.ts` and `lib/i18n.ts` import only types and are safe to reach from
the browser; `lib/locale.ts` is the server-only half because it reads
`headers()`.

Do not reintroduce a resolved `Strings` prop, and do not flatten the functions
to work around it. The boundary was what was wrong, not the functions.

### Two smaller consequences

Reading `headers()` in the root layout makes the whole app dynamic, so `/login`
and `/signin` are no longer prerendered. Accepted: the language is right on
first paint rather than flickering after hydration.

`adminSectionLabel` and `studentSectionLabel` existed because the admin said
"This week" and the student "Cette semaine". Once both followed one locale they
became the same function, and are merged into `sectionLabel` rather than left as
two identical implementations to drift.

### What is not translated

Jenn's biography on the landing page, and anything inside a published `Page`'s
HTML. Both are her own content. Also left fixed: the *Français Avec Jenn*
wordmark, a brand name; and three literal examples in the card editor
(`"I used to pack a lunch every day"`, `"Je faisais un lunch chaque jour"`,
`"Imparfait"`), which demonstrate what an English sentence, a French sentence
and a French grammar term look like — they are content, not chrome, and must not
move with the reader's browser.

## The palette

`--color-accent` becomes a lilac drawn from the `--card-plum` wordmark hue and
lightened. `#B05C9A` was the first choice and was **rejected on measurement**:
4.34:1 against white, short of the 4.5:1 it needs as button and chat-bubble
text. `#AC5395` clears it at 4.75:1. Measure before moving this variable.

The admin adopts much more of the card palette — paper, lines and ink on its
panels, tiles, fields and headings — keeping the lilac for primary controls.
That extends the reason `Tile` and `PageTile` already carried: Jenn should see
her pages the way her students do. **The two palettes are not merged**, and
neither set may be deleted or renamed; the `--card-*` set still belongs to the
flashcard template and travels with it.

Destructive and error text moved to `--card-rouge`. That is not decoration:
`--color-accent` is lilac now and no longer reads as an error colour.

## The four smaller fixes

- **The wordmark is no longer a link**, on either page. With `/` redirecting a
  signed-in visitor straight back, following it was a round trip to nowhere.
- **The week range reads as a control.** It was already the calendar's trigger
  but was drawn as an uppercase mono eyebrow, which reads as a caption. It is a
  pill now, with a border, a fill, a calendar icon, a rotating chevron, and
  hover, focus and pressed states.
- **Sign-out moved to the foot of the student page**, centred under a hairline
  rule. It sat above everything the student came for. The sign-up and sign-in
  panels stay where they are — those are the reason the student is on the page,
  and below the fold would hide the only thing they can act on.
- **The admin gets the student page's header block**: the wordmark, then *Admin*,
  then *Hello Jenn!*.

## The refresh

Scoped by the owner to `/g/[slug]` and the three `/admin` tabs, plus the tiles
and forms they share. No behaviour, copy or palette changes.

`--space-1` … `--space-6` were declared and almost unused. They are now used for
the **page-level rhythm seams** — header, tab strip, date nav, content — on both
pages, which is what keeps the two agreeing; a real drift was found and fixed
there, where the admin's tab strip used 40px against the student's 32px. They
are deliberately **not** retrofitted onto every gap: six values cannot describe
every distance in an interface, and pretending otherwise produces worse spacing
than plain utilities.

Interactive controls reach a 44px hit box, usually through padding and a
negative margin rather than by growing the visible control — the day dots keep
their 32px circle and gain an invisible `before:` hit area. Two exceptions state
their reasons in place: a tile's three action icons, which would overflow a
140px tile on a two-column phone grid, and the month calendar's dense grid.

Before this pass exactly one control on either surface had a `focus-visible`
ring. One ring per palette now lives in `card-styles.ts` and `ui/field.ts` and
is reused rather than repeated.

No new keyframes: `AddSheet` and `AddMenu` reuse `panel-rise` and `panel-pop`.
Everything animated carries `motion-reduce:animate-none`, everything transitioned
carries `motion-reduce:transition-none`.

## Verification

Lint, `tsc`, 972 tests and the build all pass. Beyond that — and this is the
lesson the boundary bug taught — the running app was exercised on `/`, `/g/all`,
`/signin`, `/login` and `/admin` in **both** languages, with the dev log checked
for new errors. Static checks alone would have reported this work as finished
while every page returned 500.

Not done: no one has looked at any of this in a browser on a phone. Six of the
seven items are visual.
