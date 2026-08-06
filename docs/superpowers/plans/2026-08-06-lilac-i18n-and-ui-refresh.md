# Lilac palette, browser-chosen language, and a UI refresh — 2026-08-06

Seven items from the owner. Six tasks, in five waves, because the language work
touches nearly every component and must not run beside anything that moves the
same markup.

Order is deliberate: the string layer is settled first, then the styling moves
markup that already reads from it. The reverse would mean touching every file
twice.

Conventions that bind every task: logic with a rule in it goes in `lib/` with a
test in `tests/lib/`; comments record the decision and the failure that motivated
it, never a restatement of the code; `@/` import alias; Tailwind v4 with the
`--color-*` (app) and `--card-*` (flashcard) palettes; **no task edits
`CLAUDE.md`** — the spec text is written once at the end.

Verification for every task, all green before it reports done:
`npm run lint`, `npx tsc --noEmit`, `npm test`.

## Decisions taken before any of this starts

- **Language is chosen from the browser, everywhere, for both audiences**, with
  French as the fallback. This retires the documented split "Jenn's UI is
  English and a student's is French". Item 6's English *Admin* / *Hello Jenn!*
  are therefore the **English translation** of those two strings, not fixed
  labels — Jenn on an `fr-CA` browser correctly sees the French ones.
- **There is no language switcher.** `Accept-Language` is the only input. The
  accepted cost is stated plainly: a wrong browser setting cannot be corrected
  from inside the site.
- The **UI refresh is scoped to `/g/[slug]` and the three `/admin` tabs**, plus
  the shared tiles and forms they both render. The landing page, `/signin`,
  `/login`, the worksheet shell, `/p/[slug]` and the whiteboard editor are left
  alone.
- The **landing page's prose is content, not UI**, and is not translated. Jenn's
  biography is a thing she wrote, and machine-translating it is a content
  decision that is not mine to take.

---

## Wave 1, Task F — The primary colour becomes lilac

**Files:** `app/globals.css` only.

`--color-accent` is `#A8462F`, a burnt orange. It becomes a lilac drawn from the
same hue as the *Français Avec Jenn* wordmark (`--card-plum: #9c4a86`), one step
lighter:

- `--color-accent: #B05C9A`
- `--color-accent-soft: #F1E0EC`

Nothing else in the file changes in this task. Record in a comment that the
accent is derived from `--card-plum` and that the two are meant to stay related —
the wordmark and the primary control are the same colour family on purpose, and
whoever changes one should look at the other.

Check the result reads on the cream `--color-bg`: `--color-accent` carries white
text on buttons and chat bubbles, so it must stay dark enough for that. If
`#B05C9A` does not clear 4.5:1 against white, darken it until it does and say so
in the report.

---

## Wave 1, Task G — Three fixes on the student page

**Files:** `app/g/[slug]/page.tsx`, `components/student/CardDateNav.tsx`,
`components/student/StudentAuthPanel.tsx`.

1. **The wordmark is no longer a link.** `app/g/[slug]/page.tsx` wraps
   *Français Avec Jenn* in `<Link href="/">`. Remove the link and keep the
   heading. A student pressing the site's own name and landing on Jenn's
   biography is a dead end — and with the landing page now redirecting a
   signed-in student straight back, it is a round trip to nowhere.
2. **The week range must read as a control.** It is already the calendar's
   trigger (`CardDateNav`), but it is drawn as an uppercase mono eyebrow with a
   `⌄` after it, which reads as a caption. Give it a real button treatment: a
   pill with a visible border in `--card-line`, a `--card-paper` fill, a
   calendar icon on the left, the chevron on the right rotating when open,
   plus hover, focus-visible and pressed states. Keep the existing text and keep
   `aria-haspopup="dialog"` / `aria-expanded`. It must stay a `<button>`.
3. **Sign-out moves to the very bottom of the page.** `StudentAuthPanel`'s
   `signed-in` branch currently renders a right-aligned *Se déconnecter* just
   under the tab strip, which puts a destructive-ish control above everything
   the student came for. Render that branch at the end of the page body instead,
   after the tab content, centred, separated by a hairline rule and generous top
   margin. The other two branches (`signup`, `login`) stay exactly where they
   are — those are the reason the student is on the page, and moving them below
   the fold would hide the only thing they can act on.
   Do this by moving where the `signed-in` case is rendered, not by adding a
   second component. `authPanelMode` and every rule in `lib/student-gate.ts` are
   untouched.

---

## Wave 2, Task H1 — The language foundation, and the student surface

**Files:** new `lib/i18n.ts`, new `lib/strings.ts` (or `lib/strings/`), new
`lib/locale.ts`, new `tests/lib/i18n.test.ts`, `app/layout.tsx`, `lib/format.ts`,
`lib/week.ts`, `app/g/[slug]/page.tsx`, everything in `components/student/`,
`components/ui/MonthCalendar.tsx`.

### The foundation

1. **`lib/i18n.ts` — pure, tested.**
   - `export type Locale = "fr" | "en"`.
   - `export const DEFAULT_LOCALE: Locale = "fr"`.
   - `export function pickLocale(acceptLanguage: string | null): Locale` — parse
     the header with its q-values and answer `"en"` only when English outranks
     French; anything else, including a missing, empty or unparseable header,
     answers `"fr"`. French is the fallback because this is a French tutor's
     site: an unknown visitor gets the language the content is in.
   - Test it hard, because a header parser is exactly the kind of thing that
     looks right and is not: `null`, `""`, `"en"`, `"fr"`, `"en-CA,en;q=0.9"`,
     `"fr-CA,fr;q=0.9,en;q=0.8"`, `"en;q=0.8,fr;q=0.9"` (French wins on q despite
     coming second), `"*"`, `"de,es"`, and a malformed `"en;q=banana"`.
2. **`lib/strings.ts` — one `Strings` type, two objects, `getStrings(locale)`.**
   - Group by area (`student`, `admin`, `chat`, `common`), nested objects, not a
     flat key soup — a flat namespace of several hundred keys is a namespace
     nobody can find anything in.
   - **The type must make a missing English key a compile error.** Declare the
     French object as the `Strings` type and the English one as `Strings` too,
     so `tsc` names anything either side is missing. That is the whole reason
     this is TypeScript objects and not JSON.
   - Values that interpolate are **functions**, not templates with placeholders
     to substitute by hand: `greeting: (name: string) => \`Bonjour ${name}\``.
     French and English disagree about word order, and a placeholder scheme
     invites building sentences by concatenation, which does not survive
     translation.
3. **`lib/locale.ts` — the impure half**, so `lib/i18n.ts` stays testable with no
   request in scope. `export async function currentLocale(): Promise<Locale>`
   reads `headers()` and calls `pickLocale`. Add `getStrings` on top of it if a
   convenience wrapper reads better at the call sites.

### How it reaches components

**Server components read the locale; client components take strings as props.**
That is already this codebase's pattern — `ChatFab` and `InboxFab` take a
`labels` object — so follow it rather than adding a client-side context. It also
avoids the whole class of hydration bug this project keeps warning about: the
locale comes from a request header, so the server and the browser agree by
construction.

`app/layout.tsx` sets `<html lang={locale}>`, which it currently hard-codes to
`"en"`.

**Note the cost in a comment:** reading `headers()` in the root layout opts the
whole app into dynamic rendering, so `/login` and `/signin` stop being
statically prerendered. That is affordable here — one tutor, one small box — and
it is the price of the language being right on the first paint rather than
flickering after hydration.

### Dates

`lib/format.ts`'s `formatCardDate` and `formatLongDate` hard-code `"fr-CA"`.
Both take a `Locale` (or a BCP-47 string derived from one) now. Keep
`timeZone: "UTC"` on every one of them — that is a project-wide rule with a
section of its own, and nothing here may weaken it.

`lib/week.ts`'s `MONTHS` is an English array used by `formatWeekRange` and by
`MonthCalendar`. It needs a French counterpart, chosen by locale. `CardDateNav`
carries a comment explaining that the calendar's month names are English *to
match the trigger above them*; once both follow the locale that reason is spent
— replace the comment rather than leaving it to contradict the code.

`FRENCH_DAYS` in `CardDateNav` becomes locale-driven too. Its comment about full
names giving React a distinct key — two of five initials are "M" — still holds in
French and stops holding in English; keep the full names anyway and say why.

### The student surface

Migrate every user-visible string in `app/g/[slug]/page.tsx`,
`components/student/*` and `components/ui/MonthCalendar.tsx` into the
dictionary, and translate each into English. That includes `aria-label`s,
`title`s, placeholders and error sentences — a screen reader label is a
user-visible string.

Two things to be careful with:

- **`components/student/ShelfFab.tsx` already has a two-language `LABELS`
  map**, keyed by role, because Jenn's UI was English and the student's French.
  That reason is gone. Collapse it into the dictionary — but keep the *role*
  distinction, which is a different thing and still real: the student's menu has
  no *Add a page*.
- **Error sentences from server actions.** Several are French strings returned
  from `app/actions.ts` / `app/student-auth-actions.ts` and rendered verbatim.
  Those actions run on the server and can read the locale, so route them through
  the dictionary too. Do not translate in the component by matching on the
  French text.

---

## Wave 3, Task H2 — The admin and shared surface

**Files:** `app/admin/**`, `components/admin/**`, `components/chat/**` callers,
`components/ui/**` (the parts not already done), `app/page-actions.ts` and
`app/actions.ts` where they return user-visible sentences.

Same dictionary, same rules. Add an `admin` area to `Strings` and migrate every
string in the admin tabs, the page editor, the student list, the inbox labels
and the shared `components/ui/` pieces.

The chat components themselves already take a `labels` prop and need no change
— only their **callers** do, which are `app/g/[slug]/page.tsx` (done in H1) and
`components/chat/TeacherInbox.tsx`. The `locale` field inside those label
objects, currently `"fr-CA"`, must follow the chosen locale: it is what
`formatTime`, `listStamp` and `dayHeading` format against.

**Do not translate:** the landing page's biography prose (`app/page.tsx`), and
anything inside a published `Page`'s HTML — that is Jenn's own document and is
served verbatim by design.

When the migration is complete, grep for remaining hard-coded French and English
in the two surfaces and report anything deliberately left behind, with the
reason.

---

## Wave 4, Task I — The admin adopts the student page's colours and header

**Files:** `components/admin/AdminChrome.tsx`, `components/admin/AdminTabs.tsx`,
`app/admin/page.tsx`, and the admin components whose surfaces need to follow.

Two halves.

1. **The header.** The admin gets the same header block the student page has:
   *Français Avec Jenn* as the serif wordmark in `--card-plum`, then **Admin**,
   then **Hello Jenn!** — both from the dictionary, so an `fr-CA` browser gets
   the French. Centred, matching `/g/[slug]`'s rhythm. The wordmark is **not** a
   link here either, for the same reason Task G removed it there.
2. **The colours.** The admin currently reads as a different product: the
   `--color-*` palette is cooler and flatter than the `--card-*` one the student
   sees. Bring the two together — the card palette's paper, lines and ink on the
   admin's panels, tiles and fields, keeping the lilac accent from Task F for
   primary controls. `components/ui/Tile.tsx` and `components/ui/PageTile.tsx`
   already render in the card palette on both sides, which is the precedent to
   follow, and the spec's stated reason for it: Jenn should see her pages the way
   her students do.

   **Do not merge the two palettes into one.** They are separate for a documented
   reason — the `--card-*` set belongs to the flashcard template and travels with
   it. This task makes the admin *use* more of it, not delete the boundary.

---

## Wave 5, Task J — The spacing, rhythm and motion pass

**Files:** `/g/[slug]` and `/admin` and the shared tiles and forms they render.

No behaviour changes. No new features. No copy changes. Only spacing, padding,
type rhythm, motion and interaction states.

What to actually do:

- **A spacing scale, used.** `app/globals.css` already declares `--space-1`
  through `--space-6` and almost nothing uses them. Either use them or delete
  them; what must not survive is a page whose vertical rhythm is thirty
  different ad-hoc Tailwind values.
- **Touch targets.** Every interactive element on a phone reaches 44px. The
  student page's day dots are 34px and the `linkButton` text buttons are smaller
  still.
- **Focus-visible on everything interactive.** Several controls currently show
  focus only as a border-colour change, and a few show nothing.
- **Consistent motion.** Reuse the keyframes added on 2026-08-05 rather than
  inventing new ones, keep durations in the 150–320ms band, and put
  `motion-reduce:animate-none` on anything that animates. Hover and colour
  transitions get a single shared duration.
- **Empty, loading and error states** get the same treatment across both
  surfaces, rather than each form inventing its own.
- **Vertical rhythm on `/g/[slug]`:** the header, tab strip, date nav and content
  currently use unrelated margins. Give the page one rhythm.

Do not touch the flashcard itself (`CardFront`, `CardBack`, `Flashcard`) — that
is a designed artefact and its proportions are deliberate.

---

## After all six: verification and documentation

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` — all four
green — before anything is claimed done.

Then write the spec and update `CLAUDE.md`. The largest edit is that the
documented rule **"Student is the UI word... the admin renders English and the
student French"** is retired: language now follows `Accept-Language` on both
surfaces, with French as the fallback and no override. The "Student"/"Group"
naming convention beside it is unaffected and stays.
