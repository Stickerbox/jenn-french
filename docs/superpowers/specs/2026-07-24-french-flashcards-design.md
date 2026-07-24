# Word-of-the-Day French Flashcards — Design

## Purpose

A website for a French tutor to post a daily "word of the day" flashcard to her
students. Students visit a bookmarked link, see today's word as a flashcard,
attempt to translate an English sentence into French, then flip the card to
check the answer and read examples. The teacher manages everything from an
admin area — she doesn't need to touch code or a database to post a new word.

## Stack

Reuses the proven parts of the reference architecture at
`/Users/jordandixon/Developer/Web/Winery` (see `WEBSITE_TEMPLATE.md` in that
repo), trimmed to what this project actually needs. No AI features and no
image uploads, so the Anthropic SDK and `sharp` are dropped.

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | App Router only |
| Language | TypeScript 5 | Strict mode |
| UI | React 19 + Tailwind CSS v4 | v4 uses PostCSS, not a config file |
| Database ORM | Prisma 6 | SQLite in dev and production |
| Database | SQLite (`dev.db`) | Stored on the server; not in git |
| Auth | WebAuthn / Passkeys (`@simplewebauthn`) | Teacher only, single account, no passwords |
| Animations | Framer Motion | Card flip transition |
| Icons | lucide-react | |
| Testing | Vitest | Unit tests for card-resolution logic |
| Linting | ESLint 9 (eslint-config-next) | Run before every commit |
| Process manager | pm2 | Keeps Next.js alive on the server |
| Reverse proxy | nginx | Terminates SSL, proxies to pm2/Next.js on port 3000 |
| SSL | Let's Encrypt (certbot) | Auto-renewed |
| Hosting | AWS EC2 t3.small, Ubuntu 24.04 LTS | Same pattern as reference project |
| Static IP | AWS Elastic IP | Survives instance restarts |
| DNS | Namecheap | Domain TBD — decide before deployment |
| CI | GitHub Actions | Lint → type-check → test → build on every push to main |

Explicitly **not** included: Anthropic SDK / AI features, `sharp` / image
uploads — neither applies to this project.

## Core Concept: Default Word + Group Overrides

The teacher has multiple groups/classes (e.g. "A1", "Tuesday Evening"). By
default, **every group sees the same word on a given day** — she only has to
post once. If a specific group needs something different that day (e.g. a
harder word for an advanced class), she adds a one-off override for that
group and date; it takes precedence only for that group, only for that date,
and doesn't affect anyone else or any other day.

### Resolution logic

For a given group and date `D`, the effective card is resolved as:

1. Find the group's most recent override with `date <= D` → candidate A.
2. Find the most recent `GlobalCard` with `date <= D` → candidate B.
3. Whichever candidate has the **later date wins**. On an exact date tie,
   the group override wins (explicit beats default).
4. If neither exists, the student page shows an empty state
   ("Nothing posted yet — check back soon!").

This single comparison also implements "no word posted today → fall back to
the most recent word" without any special-cased logic — it falls out
naturally from "find the most recent record `<= today`."

This is the one piece of real business logic in the app and gets direct unit
test coverage (see Testing below).

## Data Model

```prisma
model Group {
  id        String   @id @default(cuid())
  name      String             // e.g. "Tuesday Evening A1"
  slug      String   @unique   // teacher-chosen, short — used in /g/[slug]
  createdAt DateTime @default(now())
  cards     Card[]             // group-specific OVERRIDES only, not the default
}

model GlobalCard {
  id            String   @id @default(cuid())
  date          DateTime @unique   // the default word for this date, shown to every group
  frenchWord    String
  wordType      String?            // noun, verb, adjective, tense, etc.
  pronunciation String?            // IPA or phonetic note
  englishPrompt String             // front: sentence to translate
  frenchAnswer  String             // back: correct translation
  examples      String             // back: extra example sentences, one per line
  tip           String?            // back: short usage/grammar note
  createdAt     DateTime @default(now())
}

model Card {                       // group-specific override for one date
  id            String   @id @default(cuid())
  groupId       String
  group         Group    @relation(fields: [groupId], references: [id])
  date          DateTime
  frenchWord    String
  wordType      String?
  pronunciation String?
  englishPrompt String
  frenchAnswer  String
  examples      String
  tip           String?
  createdAt     DateTime @default(now())

  @@unique([groupId, date])        // one override per group per day
}
```

`GlobalCard` and `Card` intentionally duplicate the same content fields
rather than sharing a polymorphic base — with only 8 fields, the duplication
is cheaper than the indirection, and it keeps the resolution query simple
(two straight lookups, no `groupId IS NULL` branching).

## Pages & Routes

| Route | Access | Purpose |
|---|---|---|
| `/g/[slug]` | Public, no login | The one page students bookmark. Shows the effective card for today (flips on click) plus an archive of past dates. |
| `/g/[slug]?date=YYYY-MM-DD` | Public, no login | Same page, viewing a specific past day's effective card instead of today's. |
| `/login` | Public | Teacher passkey login |
| `/admin` | Teacher only | Post/edit the global word for any date (the default, one-word-a-day action) + list of groups |
| `/admin/[slug]` | Teacher only | Manage overrides for one group: which dates use the shared word vs. have a custom one, add/edit an override |

## Student Flashcard Page (`/g/[slug]`)

**Front face:**
- French word, large, `--font-display` (Fraunces, bold italic)
- English example sentence beneath it, to translate
- Small tag showing word type/tense

**Back face** (revealed on click via Framer Motion 3D flip):
- French answer sentence
- Additional example sentences (whichever the teacher filled in)
- Pronunciation note and usage tip, if present

**Archive:** below the card, a list/strip of previous dates for that group's
effective schedule (most recent first), today marked as current. Clicking a
date swaps the card's content in place — no page navigation, so it stays the
single page the student bookmarks.

**Empty state:** if no `GlobalCard` or override exists for the group at all
yet, show a friendly placeholder instead of a broken flip card.

## Teacher Admin Flow

1. Logs in at `/login` via passkey (Face ID / Touch ID / security key) — one
   teacher account, no passwords, no self-serve registration.
2. `/admin` is the default posting screen: a calendar/list to post or edit
   the global word for any date. Also lists her groups with a "+ New Group"
   action (name + teacher-chosen slug).
3. `/admin/[slug]` shows that group's override calendar — which dates
   currently resolve to the shared word vs. have a group-specific override —
   and lets her add/edit an override for a date.
4. Card form fields: French word, word type, pronunciation, English prompt,
   French answer, examples (textarea, one per line), tip.
5. No group-deletion flow in v1 (YAGNI) — she can create a new group and
   stop sharing an old link if needed.

## Visual Design Tokens

Defined as CSS custom properties in `globals.css`, consumed by small
composable components (`Flashcard`, `CardFace`, `WordTag`, etc.) rather than
one monolithic card component, so the same tokens can drive future
components without rework.

```css
:root {
  /* Color */
  --color-bg: #FBF3E9;           /* page background — light warm cream */
  --color-card-bg: #F5E6D3;      /* card face — slightly deeper cream */
  --color-ink: #211C17;          /* primary text — warm near-black */
  --color-ink-muted: #6B6259;    /* secondary text — warm gray */
  --color-accent: #A8462F;       /* terracotta — tag, tip highlight, flip hint */
  --color-accent-soft: #EFD9C9;  /* tag background */

  /* Type */
  --font-display: 'Fraunces', serif;   /* the French word — bold italic */
  --font-body: 'Inter', sans-serif;    /* everything else */

  /* Spacing scale */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 1rem;
  --space-4: 1.5rem;  --space-5: 2rem;  --space-6: 3rem;

  /* Card */
  --radius-card: 1.5rem;
  --shadow-card: 0 20px 40px -12px rgb(33 28 23 / 0.18);
}
```

Reference: old-school textbook italic serif headline on warm cream, clean
gray-black sans body copy, generous whitespace, soft-shadowed rounded card.
`Fraunces` (Google Fonts) is the closest free match to the condensed
bold-italic serif look used as reference. Dark mode is out of scope for v1 —
the warm cream palette is the only theme.

## Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` on server | SQLite path: `file:./dev.db` |
| `RP_ID` | `.env.local` | WebAuthn relying party ID (domain only, no protocol) — TBD in prod, `localhost` in dev |
| `ORIGIN` | `.env.local` | WebAuthn expected origin (full URL) — TBD in prod, `http://localhost:3000` in dev |

No `ANTHROPIC_API_KEY` — this project has no AI feature, and the reference
project's two security incidents both traced back to an exposed key, so this
is one less secret in play.

## Deployment

Same pattern as the reference project: AWS EC2 t3.small (Ubuntu 24.04) +
nginx + pm2 + Let's Encrypt, GitHub Actions CI (lint → typecheck → test →
build on every push to `main`), same security hardening checklist:

- SSH security group restricted to My IP only, never `0.0.0.0/0`
- `.pem` key and all `.env*` files gitignored, never committed
- fail2ban enabled, SSH password auth disabled
- `ufw deny 3000/tcp` to block direct Next.js port access
- unattended-upgrades enabled for automatic OS security patches
- `chmod o+x /home/ubuntu` if any static asset serving via nginx alias is
  ever added (not needed initially — no uploads in this project)

Domain is still TBD — placeholder in `RP_ID`/`ORIGIN` until decided, update
before the real deploy following the reference project's "Full Fresh
Instance" runbook.

## Testing & Error Handling

- Vitest unit tests for the card-resolution logic: global vs. override
  selection, exact-date tie-breaking (override wins), fallback to most
  recent when nothing is scheduled for today, and the fully-empty case.
- `/admin*` routes redirect unauthenticated visitors to `/login`, mirroring
  the reference project's `getCurrentUser()` pattern — every admin server
  action checks the session first.
- Unknown `/g/[slug]` → standard 404.
- Group with no resolvable card at all → empty-state UI on the student page,
  not a broken flip card.

## Explicit Scope Cuts (YAGNI)

- No student accounts/login — shareable link per group is the only access
  control, and none is needed since content isn't sensitive.
- No group deletion in v1.
- No AI features, no image uploads.
- No dark mode — single warm-cream theme.
