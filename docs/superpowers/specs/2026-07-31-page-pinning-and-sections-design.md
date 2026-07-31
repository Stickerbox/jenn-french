# Pinned pages and dated sections — design

Date: 2026-07-31

## Problem

Both page lists are one flat grid ordered newest first. That ordering has two
failures. A page Jenn wants permanently to hand — a pronunciation reference, a
verb table — sinks as she publishes newer ones, and there is nothing she can do
about it short of republishing. And a long shelf gives no sense of *when*
anything arrived: twenty tiles in a row, each carrying a date only in its
eyebrow, is a list the eye has to read rather than scan.

## Goal

Jenn can pin a page, and a pinned page sits at the top of both her list and
every student's shelf regardless of its date. Everything unpinned falls under a
heading saying roughly when it arrived.

## Scope

New:

- `prisma/schema.prisma` — `Page.pinnedAt`, plus a migration
- `lib/page-sections.ts` — `sectionPages`, `SectionKey`, `PageSection`
- `tests/lib/page-sections.test.ts`

Changed:

- `lib/pages.ts` — select `pinnedAt` in the three read functions
- `app/page-actions.ts` — `setPagePinned`
- `components/ui/PageTile.tsx` — an optional `badge` slot
- `components/admin/PageList.tsx` — render sections, add the pin control
- `components/student/FilesTab.tsx` — render sections, show the pin marker
- `CLAUDE.md` — the uploaded-pages section

Unchanged, deliberately:

- `lib/effective-pages.ts`. It merges a student's own pages with the everyone
  group's and sorts them by date. Pinning is a display concern applied
  afterwards by `sectionPages`, so the merge rule never learns about it.
- `lib/week.ts`. `weekRange` is reused, not reimplemented.
- `HtmlPreview`, `/p/[slug]`, the raw route and its CSP.

## Data model

```prisma
pinnedAt DateTime?
```

Null means unpinned. A timestamp means pinned, and pinned pages sort among
themselves **most recently pinned first**.

A nullable timestamp rather than a boolean, because a boolean would leave
pinned pages sorted by creation date — which is precisely the ordering pinning
exists to override. With three pinned pages, "the one I pinned last" is a
question the column should be able to answer.

No backfill: every existing row starts null, which is correct.

## The sections

`lib/page-sections.ts`, pure and tested:

```ts
export type SectionKey =
  | { kind: "pinned" }
  | { kind: "thisWeek" }
  | { kind: "lastWeek" }
  | { kind: "month"; year: number; month: number };

export type PageSection<T> = { key: SectionKey; pages: T[] };

export function sectionPages<T extends { createdAt: Date; pinnedAt: Date | null }>(
  pages: T[],
  today: Date,
): PageSection<T>[];
```

It returns a **key, not a label.** The admin renders "This week" and the
student renders "Cette semaine"; a function returning display strings would
have to know which surface called it, and the rule and the copy would be stuck
in the same file. The rule lives here with its tests, and each list owns its
own words.

Rules, all in UTC like every other date in this project:

- A pinned page appears **only** under `pinned`, never also under its date
  section. "Always at the top" means one place, not two.
- `thisWeek` is `createdAt >= weekRange(today).start`, with **no upper bound**.
  `weekRange` returns Monday–Friday, so a closed range would drop a page added
  on a Saturday into a month section below pages a week older than it. The open
  upper bound also matches the project's standing convention that both weekend
  days belong to the week that has just ended.
- `lastWeek` is the previous week's `start` up to (not including) this week's.
- Everything older gets one section per calendar month, newest first, and the
  label always carries the year. A shelf spanning a year boundary would
  otherwise show two headings both reading "JULY". The current month can appear
  as a month section too, holding only the part of it older than last week — on
  31 July, "JULY 2026" holds 1–18 July while 20–31 July sit under the two week
  headings above it. That is intended, not a double-count: no page is in two
  sections.
- Sections with no pages are not returned. This matters in the admin, where the
  search field and the student chips filter first and the sections form over
  whatever survives — a heading above nothing would be a bug the filter caused.
- Within every section, newest first, except `pinned`, which is by `pinnedAt`.

## The pin control

`setPagePinned(slug: string, pinned: boolean)` in `app/page-actions.ts`, a
server action beginning with the teacher check that every mutating action in
this project begins with, then `revalidatePath` for the admin and the student
page. It writes `pinnedAt: pinned ? new Date() : null` — re-pinning an
already-pinned page therefore floats it, which is the behaviour the column was
chosen for.

In the admin footer, a third icon beside the pencil and the download: filled
when pinned, hollow when not, one click to toggle. It is a `<form>` button
rather than a link, because it mutates.

On the student side there is a small pin marker in the preview's top corner and
no control. Students should be able to see why a page sits above a newer one.

`PageTile` grows one optional slot for it:

```
badge?: ReactNode   rendered over the preview's top-right corner
```

A slot, like `preview`, and for the same reason: the tile does not learn what a
pin is, and a later marker — "new", "unread" — needs no change here.

## Copy

Headings follow each surface's language, as all other copy in this project
does.

| `SectionKey` | Admin | Student |
|---|---|---|
| `pinned` | Pinned | Épinglé |
| `thisWeek` | This week | Cette semaine |
| `lastWeek` | Last week | La semaine dernière |
| `month` | JULY 2026 | JUILLET 2026 |

Month names come from the existing `MONTHS` array in `lib/week.ts` for the
admin, and from `toLocaleDateString("fr-CA", …)` for the student, matching how
each surface already formats a date.

## Testing

`tests/lib/page-sections.test.ts` covers, with a fixed `today`:

- a pinned page appears under `pinned` and not under its date section
- pinned pages order by `pinnedAt` descending, not `createdAt`
- a page created today lands in `thisWeek`
- a page created on the Saturday of a week lands in that week, not in a month
- the boundary between `thisWeek` and `lastWeek` is the Monday
- pages older than last week split into one section per month, newest first
- two Julys in different years produce two sections, not one
- empty sections are absent from the result
- an empty input returns an empty array

Components remain untested, as all components here are. Manual verification
covers the pin toggle round trip and the headings on both surfaces.

## Verification

`npx prisma generate`, `npm run lint`, `npx tsc --noEmit`, `npm test`,
`npm run build` — the CI order, with the generate step first because the schema
changed.

Manually: pin a page in the admin and confirm it moves to the top of both the
admin list and the student shelf, that the marker appears on the student tile,
that unpinning returns it to its date section, and that searching in the admin
re-forms the headings over the filtered set without leaving an empty one.
