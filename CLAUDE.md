# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A daily French flashcard site for a single tutor (Jenn) and her students. Students
open a bookmarked group link and see that day's card; the teacher writes cards from
an admin area behind a passkey. Live at https://francaisavecjenn.ca.

## Commands

```bash
npm run dev            # next dev
npm run build          # next build
npm run lint           # eslint .
npm run typecheck      # tsc --noEmit
npm test               # vitest run

npx vitest run tests/lib/week.test.ts        # one file
npx vitest run -t "clamps future dates"      # one test by name
npx prisma generate                          # after any schema.prisma change
npx prisma migrate dev --name <name>         # create + apply a migration
```

CI (`.github/workflows/ci.yml`) runs, in order: `prisma generate` → lint → `tsc
--noEmit` → test → build. Run those locally before claiming work is done.

Env vars live in two gitignored files: `.env` holds `DATABASE_URL`
(`file:./dev.db`), `.env.local` holds `RP_ID`, `ORIGIN`, `ANTHROPIC_API_KEY`.
Prisma reads `.env`; Next.js reads both.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/` | public | landing page |
| `/g/[slug]` | students | the card for `?date=`, defaulting to today |
| `/login` | teacher | passkey register/authenticate |
| `/admin` | teacher | edits the **global** card for `?date=` + group management |
| `/admin/[slug]` | teacher | edits one group's **override** card for `?date=` |
| `/api/auth/*` | — | WebAuthn ceremonies (the only route handlers; everything else is a server action) |

## Architecture

### Two-tier cards

`GlobalCard` is the default card for a date, shown to every group. `Card` is a
per-group override for the same date (`@@unique([groupId, date])`). `getEffectiveCard`
(`lib/cards.ts`) fetches both in parallel and hands them to `pickEffectiveCard`
(`lib/card-resolution.ts`), which is a pure function so the resolution rule is
testable without a database. A date with neither row resolves to `null` and the
page says nothing was posted — it deliberately does **not** fall back to an
earlier day, because that made the week picker lie.

### Card sections

The body of a card is `sections: Json?` — an array of `{title, body}` the teacher
orders herself (`lib/sections.ts`). The older scalar columns
(`examples`, `pronunciation`, `tip`, `idiom`) are still in the schema and are
intentionally left untouched: `toUpdateData` in `app/actions.ts` omits them so they
remain a rollback path. `toCreateData` must still supply `examples: ""` because the
column is non-nullable. Don't "clean up" either of these without deciding to give up
the rollback.

Everything read out of the `sections` column goes through `readSections`, which
discards malformed entries rather than throwing — Prisma types a Json column as
`JsonValue`, i.e. not at all. Everything written goes through `normaliseSections`.

Two section titles are load-bearing: `IDIOM_TITLE` ("Idiom of the day") selects the
gold box on the card back, and `PRONUNCIATION_TITLE` is seeded empty on new cards.
The idiom box is matched **on the title**, not on the shape of the text — a previous
content-driven rule silently dropped styling from existing cards.

### Dates

Every date is UTC midnight, constructed as ``new Date(`${str}T00:00:00Z`)``, and
formatted with `timeZone: "UTC"`. The teaching week runs Monday–Friday; both
Saturday and Sunday belong to the week that just ended (`lib/week.ts`).

The student page clamps `?date=` to `latestViewableDate(today)` so students cannot
read ahead of pre-posted cards. `parseAdminDate` deliberately does *not* clamp —
pre-posting is the teacher's workflow, and clamping would make those days
unreachable from `/admin`. It does, however, snap a weekend date forward to the
following Monday, including its `today` fallback, so `/admin` never opens on a
non-teaching day; the five-column calendar is the UI half of the same rule.

### Auth

Exactly one teacher and exactly one passkey. `register-begin` returns 400 once a
passkey exists, and there is no UI to add a second or remove one — transferring the
account means deleting the `Passkey` row on the server (see `docs/DEPLOYMENT.md`).
The session is a 7-day httpOnly cookie holding the teacher id (`lib/session.ts`);
deleting the passkey does not invalidate it.

Every mutating server action in `app/actions.ts` and `app/ai-actions.ts` starts with
a teacher check. Add one to any new action — `ai-actions` without it is an
unauthenticated endpoint spending the project's API budget.

### Claude card generation

`lib/card-ai.ts` calls `claude-sonnet-5` to write exactly three fields —
`hint`, `grammar`, `idiom`. Subject, usage, and Québec pronunciation are the
teacher's; `CardSuggestion` has no shape for them, so a generated value cannot
reach those inputs. `thinking: { type: "disabled" }` is intentional: `max_tokens`
caps thinking and output together, and adaptive thinking was truncating the JSON.
Failures become `CardAiError` whose messages are shown to the teacher verbatim;
anything else is logged server-side and replaced with a generic message.

### Rendering

Card text uses a deliberately tiny inline markup parser (`lib/inline-markup.ts`),
not Markdown: `**bold**`, `*italic*`, `` `code` `` and nothing else. `**` is matched
before `*`, and unclosed markers stay literal.

## Conventions

- **Logic belongs in `lib/`.** Anything with a rule in it — date handling, card
  resolution, section manipulation, idiom splitting, markup parsing — is a pure
  function in `lib/` with a test in `tests/lib/`. Components and Prisma access are
  not unit-tested; the pure modules underneath them are. Follow this when adding
  behaviour.
- **Comments explain the "why", especially the counter-intuitive.** Most comments in
  this codebase record a decision and the failure that motivated it. Match that —
  don't add comments that restate the code.
- **Styling:** Tailwind v4 via PostCSS, no `tailwind.config`. Design tokens are CSS
  custom properties in `app/globals.css`, and there are two distinct palettes: the
  general app (`--color-*`) and the Québec flashcard template (`--card-*`), the
  latter scoped to `/g/[slug]`. Repeated flashcard class strings live in
  `components/card-styles.ts` — extend that rather than duplicating the strings.
- **Imports** use the `@/` alias for repo-root-relative paths.
- Server actions call `revalidatePath` for the page they affect. Deletes use
  `deleteMany` so a double-click or stale tab is a no-op rather than a P2025.

## Docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the design specs and
implementation plans for each feature, dated. Read the relevant spec before
reworking a feature — the reasoning behind the current behaviour is usually there.

`docs/DEPLOY.md` is the everyday loop: local checks → commit → push → CI → one
`deploy.sh` run on the server, plus rollback and failure modes. Pushing to `main`
runs CI but does **not** deploy; the server only changes when someone runs the
deploy step.

`docs/DEPLOYMENT.md` is the full production runbook behind it: EC2 + pm2 + nginx +
certbot, SQLite on the box with nightly `VACUUM INTO` backups to S3. It covers
restoring the database and passkey handover/lockout recovery.
