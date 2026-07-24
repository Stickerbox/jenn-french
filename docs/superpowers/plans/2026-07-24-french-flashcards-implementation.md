# Word-of-the-Day French Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-sided website — a public flashcard page students bookmark per group, and a passkey-protected admin area where a French tutor posts a shared "word of the day" (with optional per-group overrides) — per `docs/superpowers/specs/2026-07-24-french-flashcards-design.md`.

**Architecture:** Next.js 16 App Router with Prisma/SQLite for storage. A single pure function resolves "what card does group X see on date D" from two tables (`GlobalCard` for the shared default, `Card` for group-specific overrides), tested in isolation. Server Components fetch data directly; a handful of client components handle the flip animation, archive navigation, and admin forms. Teacher auth is WebAuthn passkeys against a single hardcoded account, session tracked via an HTTP-only cookie.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5 (strict), React 19, Tailwind CSS v4, Prisma 6 + SQLite, `@simplewebauthn/browser` + `@simplewebauthn/server`, Framer Motion, lucide-react, Vitest, ESLint 9.

## Global Constraints

- App Router only — no Pages Router.
- TypeScript strict mode.
- Tailwind CSS v4 (PostCSS-based config, no `tailwind.config.js`).
- No Anthropic SDK, no `sharp` / image uploads — not needed by this project.
- Auth is WebAuthn passkeys only — no passwords, no student accounts/login.
- Design tokens live as CSS custom properties in `app/globals.css`; UI is built from small composable components that consume those tokens, not one monolithic card component.
- No dark mode — single warm-cream theme (`--color-bg: #FBF3E9`, `--color-card-bg: #F5E6D3`, `--color-ink: #211C17`, `--color-ink-muted: #6B6259`, `--color-accent: #A8462F`, `--color-accent-soft: #EFD9C9`).
- Display font `Fraunces` (bold italic) for the French word; body font `Inter` for everything else.
- No group deletion in v1.
- Domain is TBD — `RP_ID`/`ORIGIN` are placeholders (`localhost` / `http://localhost:3000`) until a real domain is chosen.
- All `.env*` files and `prisma/dev.db` are gitignored — never commit secrets or the database file.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `tests/smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable, lintable, testable Next.js 16 project skeleton that every later task builds on. The `@/*` path alias resolves to the repo root in both `tsconfig.json` and `vitest.config.ts`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "jenn-french",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^6.0.0",
    "@simplewebauthn/browser": "^13.0.0",
    "@simplewebauthn/server": "^13.0.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "prisma": "^6.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0",
    "@eslint/eslintrc": "^3.1.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Write `postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 6: Write `eslint.config.mjs`**

```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
```

- [ ] **Step 7: Write `app/globals.css` (minimal for now — tokens added in Task 2)**

```css
@import "tailwindcss";
```

- [ ] **Step 8: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Word of the Day",
  description: "Daily French vocabulary flashcards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write `app/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
```

- [ ] **Step 10: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

- [ ] **Step 11: Write `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("project scaffold", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 12: Update `.gitignore`**

Ensure it contains at least:

```
node_modules
.next
.env
.env.local
.env*.local
/prisma/dev.db
```

- [ ] **Step 13: Verify build, lint, and tests pass**

Run: `npm run build && npm run lint && npx tsc --noEmit && npm test`
Expected: all four commands exit 0. The smoke test passes.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts app/layout.tsx app/page.tsx app/globals.css tests/smoke.test.ts .gitignore
git commit -m "chore: scaffold Next.js 16 project"
```

---

### Task 2: Design Tokens & Fonts

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: the scaffold from Task 1.
- Produces: CSS custom properties (`--color-bg`, `--color-card-bg`, `--color-ink`, `--color-ink-muted`, `--color-accent`, `--color-accent-soft`, `--font-display`, `--font-body`, `--space-1`..`--space-6`, `--radius-card`, `--shadow-card`) that every visual component in later tasks references directly (e.g. `bg-[var(--color-card-bg)]`).

- [ ] **Step 1: Rewrite `app/globals.css` with the full token set**

```css
@import "tailwindcss";

:root {
  /* Color */
  --color-bg: #FBF3E9;
  --color-card-bg: #F5E6D3;
  --color-ink: #211C17;
  --color-ink-muted: #6B6259;
  --color-accent: #A8462F;
  --color-accent-soft: #EFD9C9;

  /* Type */
  --font-display: var(--font-display-family), serif;
  --font-body: var(--font-body-family), sans-serif;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2rem;
  --space-6: 3rem;

  /* Card */
  --radius-card: 1.5rem;
  --shadow-card: 0 20px 40px -12px rgb(33 28 23 / 0.18);
}

body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
}
```

- [ ] **Step 2: Load Fraunces and Inter via `next/font/google` in `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["italic"],
  variable: "--font-display-family",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body-family",
});

export const metadata: Metadata = {
  title: "Word of the Day",
  description: "Daily French vocabulary flashcards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build succeeds and tokens render**

Run: `npm run build`
Expected: build succeeds with no font-loading errors.

Run: `npm run dev`, visit `http://localhost:3000` in a browser.
Expected: page redirects to `/login` (404 for now — the route doesn't exist until Task 9); confirm via browser dev tools that the page background is the warm cream color and that `--font-display-family`/`--font-body-family` are set on `<html>`.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add design tokens and fonts"
```

---

### Task 3: Shared UI Primitives & Utils

**Files:**
- Create: `lib/utils.ts`
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Input.tsx`
- Create: `components/ui/Textarea.tsx`
- Test: `tests/lib/utils.test.ts`

**Interfaces:**
- Consumes: design tokens from Task 2 (referenced via `var(--color-*)` in class names).
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`, and `<Button>`, `<Input>`, `<Textarea>` components from `@/components/ui/*` that every later component/page/form uses instead of raw HTML elements.

- [ ] **Step 1: Write the failing test for `cn()`**

```ts
// tests/lib/utils.test.ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("merges conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/utils.test.ts`
Expected: FAIL — `@/lib/utils` does not exist yet.

- [ ] **Step 3: Write `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `components/ui/Button.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "rounded-full bg-[var(--color-accent)] px-6 py-3 font-[var(--font-body)] text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 6: Write `components/ui/Input.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "mt-1 block w-full rounded-lg border border-[var(--color-ink-muted)]/30 bg-white px-3 py-2 font-[var(--font-body)] text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 7: Write `components/ui/Textarea.tsx`**

```tsx
import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "mt-1 block w-full rounded-lg border border-[var(--color-ink-muted)]/30 bg-white px-3 py-2 font-[var(--font-body)] text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 8: Run full test suite and lint**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/utils.ts components/ui/Button.tsx components/ui/Input.tsx components/ui/Textarea.tsx tests/lib/utils.test.ts
git commit -m "feat: add shared UI primitives and cn() helper"
```

---

### Task 4: Prisma Schema, Client, and CI Workflow

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/prisma.ts`
- Create: `.github/workflows/ci.yml`
- Create (local only, not committed): `.env`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `Group`, `GlobalCard`, `Card`, `Teacher`, `Passkey` Prisma models, and a singleton `prisma` client exported from `@/lib/prisma`, used by every task from here on that touches the database.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Group {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  cards     Card[]
}

model GlobalCard {
  id            String   @id @default(cuid())
  date          DateTime @unique
  frenchWord    String
  wordType      String?
  pronunciation String?
  englishPrompt String
  frenchAnswer  String
  examples      String
  tip           String?
  createdAt     DateTime @default(now())
}

model Card {
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

  @@unique([groupId, date])
}

model Teacher {
  id        String    @id @default(cuid())
  username  String    @unique
  createdAt DateTime  @default(now())
  passkeys  Passkey[]
}

model Passkey {
  id           String   @id @default(cuid())
  teacherId    String
  teacher      Teacher  @relation(fields: [teacherId], references: [id])
  credentialId String   @unique
  publicKey    Bytes
  counter      Int      @default(0)
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 2: Create local `.env` (not committed)**

```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 3: Run the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/` and `prisma/dev.db`. Prisma Client is generated automatically.

- [ ] **Step 4: Write `lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 5: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: "file:./dev.db"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
```

- [ ] **Step 6: Verify everything still builds and typechecks**

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed (Prisma Client types now resolve).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/prisma.ts .github/workflows/ci.yml
git commit -m "feat: add Prisma schema, client, and CI workflow"
```

---

### Task 5: Card Resolution Logic (Pure Functions)

**Files:**
- Create: `lib/card-resolution.ts`
- Test: `tests/lib/card-resolution.test.ts`

**Interfaces:**
- Consumes: nothing new (pure functions, no DB).
- Produces: `type CardContent`, `pickEffectiveCard(override, fallback): CardContent | null`, `mergeArchiveDates(overrideDates: Date[], globalDates: Date[]): Date[]` from `@/lib/card-resolution` — the exact functions Task 6's Prisma wrapper calls.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/card-resolution.test.ts
import { describe, it, expect } from "vitest";
import {
  pickEffectiveCard,
  mergeArchiveDates,
  type CardContent,
} from "@/lib/card-resolution";

function makeCard(date: string, frenchWord: string): CardContent {
  return {
    date: new Date(date),
    frenchWord,
    wordType: null,
    pronunciation: null,
    englishPrompt: "prompt",
    frenchAnswer: "answer",
    examples: "",
    tip: null,
  };
}

describe("pickEffectiveCard", () => {
  it("returns the global card when there is no override", () => {
    const global = makeCard("2026-07-20", "chat");
    expect(pickEffectiveCard(null, global)).toBe(global);
  });

  it("returns the override when there is no global card", () => {
    const override = makeCard("2026-07-20", "chien");
    expect(pickEffectiveCard(override, null)).toBe(override);
  });

  it("returns null when neither exists", () => {
    expect(pickEffectiveCard(null, null)).toBeNull();
  });

  it("prefers whichever of the two has the later date", () => {
    const olderOverride = makeCard("2026-07-15", "chien");
    const newerGlobal = makeCard("2026-07-20", "chat");
    expect(pickEffectiveCard(olderOverride, newerGlobal)).toBe(newerGlobal);

    const newerOverride = makeCard("2026-07-22", "chien");
    const olderGlobal = makeCard("2026-07-20", "chat");
    expect(pickEffectiveCard(newerOverride, olderGlobal)).toBe(newerOverride);
  });

  it("prefers the override when dates are exactly equal", () => {
    const override = makeCard("2026-07-20", "chien");
    const global = makeCard("2026-07-20", "chat");
    expect(pickEffectiveCard(override, global)).toBe(override);
  });
});

describe("mergeArchiveDates", () => {
  it("returns dates sorted most-recent first", () => {
    const result = mergeArchiveDates(
      [new Date("2026-07-15")],
      [new Date("2026-07-20"), new Date("2026-07-10")],
    );
    expect(result.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-07-20",
      "2026-07-15",
      "2026-07-10",
    ]);
  });

  it("dedupes when an override and a global card share the same day", () => {
    const result = mergeArchiveDates(
      [new Date("2026-07-20T00:00:00Z")],
      [new Date("2026-07-20T00:00:00Z")],
    );
    expect(result).toHaveLength(1);
  });

  it("returns an empty array when given no dates", () => {
    expect(mergeArchiveDates([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/card-resolution.test.ts`
Expected: FAIL — `@/lib/card-resolution` does not exist yet.

- [ ] **Step 3: Write `lib/card-resolution.ts`**

```ts
export type CardContent = {
  date: Date;
  frenchWord: string;
  wordType: string | null;
  pronunciation: string | null;
  englishPrompt: string;
  frenchAnswer: string;
  examples: string;
  tip: string | null;
};

export function pickEffectiveCard(
  override: CardContent | null,
  fallback: CardContent | null,
): CardContent | null {
  if (!override) return fallback;
  if (!fallback) return override;
  return override.date.getTime() >= fallback.date.getTime()
    ? override
    : fallback;
}

export function mergeArchiveDates(
  overrideDates: Date[],
  globalDates: Date[],
): Date[] {
  const unique = new Map<string, Date>();
  for (const date of [...overrideDates, ...globalDates]) {
    unique.set(date.toISOString().slice(0, 10), date);
  }
  return [...unique.values()].sort((a, b) => b.getTime() - a.getTime());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/card-resolution.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/card-resolution.ts tests/lib/card-resolution.test.ts
git commit -m "feat: add card resolution logic with tests"
```

---

### Task 6: Card Query Wrapper

**Files:**
- Create: `lib/cards.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma` (Task 4); `pickEffectiveCard`, `mergeArchiveDates`, `type CardContent` from `@/lib/card-resolution` (Task 5).
- Produces: `getEffectiveCard(groupId: string, onOrBefore: Date): Promise<CardContent | null>` and `getArchiveDates(groupId: string): Promise<Date[]>` from `@/lib/cards` — used directly by the student page in Task 15.

This task is thin wiring around already-tested pure logic (Task 5), so verification is via typecheck and a manual dev-server check rather than a new automated test — the business logic itself is fully covered.

- [ ] **Step 1: Write `lib/cards.ts`**

```ts
import { prisma } from "@/lib/prisma";
import {
  pickEffectiveCard,
  mergeArchiveDates,
  type CardContent,
} from "@/lib/card-resolution";

export async function getEffectiveCard(
  groupId: string,
  onOrBefore: Date,
): Promise<CardContent | null> {
  const [override, fallback] = await Promise.all([
    prisma.card.findFirst({
      where: { groupId, date: { lte: onOrBefore } },
      orderBy: { date: "desc" },
    }),
    prisma.globalCard.findFirst({
      where: { date: { lte: onOrBefore } },
      orderBy: { date: "desc" },
    }),
  ]);

  return pickEffectiveCard(override, fallback);
}

export async function getArchiveDates(groupId: string): Promise<Date[]> {
  const [overrides, globals] = await Promise.all([
    prisma.card.findMany({ where: { groupId }, select: { date: true } }),
    prisma.globalCard.findMany({ select: { date: true } }),
  ]);

  return mergeArchiveDates(
    overrides.map((c) => c.date),
    globals.map((c) => c.date),
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors — Prisma's generated `Card`/`GlobalCard` types satisfy `CardContent` structurally.

- [ ] **Step 3: Commit**

```bash
git add lib/cards.ts
git commit -m "feat: add Prisma-backed card query wrapper"
```

---

### Task 7: Session & Cookie Helpers

**Files:**
- Create: `lib/session.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma` (Task 4).
- Produces: `createSession(teacherId: string)`, `destroySession()`, `getCurrentTeacher(): Promise<Teacher | null>`, `setChallenge(challenge: string)`, `getChallenge(): Promise<string | null>`, `clearChallenge()` from `@/lib/session` — consumed by the WebAuthn routes (Task 8) and every protected page/action (Tasks 10, 12, 15).

- [ ] **Step 1: Write `lib/session.ts`**

```ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "teacherId";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function createSession(teacherId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, teacherId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!teacherId) return null;

  return prisma.teacher.findUnique({ where: { id: teacherId } });
}

const CHALLENGE_COOKIE = "webauthn-challenge";
const CHALLENGE_MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export async function setChallenge(challenge: string) {
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
  });
}

export async function getChallenge(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CHALLENGE_COOKIE)?.value ?? null;
}

export async function clearChallenge() {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
}
```

This module wraps `next/headers` cookies, which require a request context — it's exercised end-to-end by the manual login test in Task 9 rather than a standalone unit test.

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/session.ts
git commit -m "feat: add session and WebAuthn challenge cookie helpers"
```

---

### Task 8: WebAuthn API Routes

**Files:**
- Create: `app/api/auth/status/route.ts`
- Create: `app/api/auth/register-begin/route.ts`
- Create: `app/api/auth/register-complete/route.ts`
- Create: `app/api/auth/authenticate-begin/route.ts`
- Create: `app/api/auth/authenticate-complete/route.ts`
- Create (local only, not committed): `.env.local`

**Interfaces:**
- Consumes: `prisma` (Task 4), `setChallenge`/`getChallenge`/`clearChallenge`/`createSession` (Task 7), `RP_ID`/`ORIGIN` env vars.
- Produces: five JSON API routes consumed by the login page in Task 9 — `GET /api/auth/status` returns `{ hasPasskey: boolean }`; `POST /api/auth/register-begin` / `POST /api/auth/authenticate-begin` return WebAuthn options JSON; `POST /api/auth/register-complete` / `POST /api/auth/authenticate-complete` accept the browser's attestation/assertion JSON and return `{ verified: boolean }`.

- [ ] **Step 1: Create local `.env.local` (not committed)**

```
RP_ID="localhost"
ORIGIN="http://localhost:3000"
```

- [ ] **Step 2: Write `app/api/auth/status/route.ts`**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const count = await prisma.passkey.count();
  return NextResponse.json({ hasPasskey: count > 0 });
}
```

- [ ] **Step 3: Write `app/api/auth/register-begin/route.ts`**

```ts
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { setChallenge } from "@/lib/session";

const TEACHER_USERNAME = "teacher";
const RP_NAME = "Word of the Day";

export async function POST() {
  const existing = await prisma.teacher.findFirst({
    include: { passkeys: true },
  });

  if (existing && existing.passkeys.length > 0) {
    return NextResponse.json(
      { error: "A passkey is already registered" },
      { status: 400 },
    );
  }

  const teacher =
    existing ??
    (await prisma.teacher.create({ data: { username: TEACHER_USERNAME } }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: process.env.RP_ID!,
    userName: teacher.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setChallenge(options.challenge);

  return NextResponse.json(options);
}
```

- [ ] **Step 4: Write `app/api/auth/register-complete/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { clearChallenge, createSession, getChallenge } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegistrationResponseJSON;

  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const teacher = await prisma.teacher.findFirst();
  if (!teacher) {
    return NextResponse.json(
      { error: "No teacher account" },
      { status: 400 },
    );
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
  });

  await clearChallenge();

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  const { credential } = verification.registrationInfo;

  await prisma.passkey.create({
    data: {
      teacherId: teacher.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
    },
  });

  await createSession(teacher.id);

  return NextResponse.json({ verified: true });
}
```

- [ ] **Step 5: Write `app/api/auth/authenticate-begin/route.ts`**

```ts
import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { setChallenge } from "@/lib/session";

export async function POST() {
  const teacher = await prisma.teacher.findFirst({
    include: { passkeys: true },
  });

  if (!teacher || teacher.passkeys.length === 0) {
    return NextResponse.json(
      { error: "No passkey registered yet" },
      { status: 400 },
    );
  }

  const options = await generateAuthenticationOptions({
    rpID: process.env.RP_ID!,
    userVerification: "preferred",
    allowCredentials: teacher.passkeys.map((passkey) => ({
      id: passkey.credentialId,
    })),
  });

  await setChallenge(options.challenge);

  return NextResponse.json(options);
}
```

- [ ] **Step 6: Write `app/api/auth/authenticate-complete/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { clearChallenge, createSession, getChallenge } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as AuthenticationResponseJSON;

  const expectedChallenge = await getChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: body.id },
  });

  if (!passkey) {
    return NextResponse.json({ error: "Unknown passkey" }, { status: 400 });
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
    },
  });

  await clearChallenge();

  if (!verification.verified) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  await createSession(passkey.teacherId);

  return NextResponse.json({ verified: true });
}
```

- [ ] **Step 7: Verify typecheck and build pass**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed. Full functional verification happens in Task 9 once the login page can drive these routes from a browser.

- [ ] **Step 8: Commit**

```bash
git add app/api/auth
git commit -m "feat: add WebAuthn passkey registration and login routes"
```

---

### Task 9: Login Page

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/auth-actions.ts`

**Interfaces:**
- Consumes: `Button` (Task 3), the five `/api/auth/*` routes (Task 8), `destroySession`/`getCurrentTeacher` (Task 7).
- Produces: the `/login` page students never see but the teacher uses to authenticate; `logout()` server action from `@/app/auth-actions` used by the admin layout in Task 12.

- [ ] **Step 1: Write `app/auth-actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/session";

export async function logout() {
  await destroySession();
  redirect("/login");
}
```

- [ ] **Step 2: Write `app/login/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => setHasPasskey(data.hasPasskey));
  }, []);

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/register-begin", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const options = await optionsRes.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/register-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error);

      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/authenticate-begin", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const options = await optionsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/authenticate-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error);

      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="mb-6 font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          Word of the Day
        </h1>
        {hasPasskey === null && (
          <p className="text-[var(--color-ink-muted)]">Loading...</p>
        )}
        {hasPasskey === false && (
          <Button onClick={handleRegister} disabled={busy}>
            Set up your passkey
          </Button>
        )}
        {hasPasskey === true && (
          <Button onClick={handleLogin} disabled={busy}>
            Sign in with passkey
          </Button>
        )}
        {error && (
          <p className="mt-4 text-sm text-[var(--color-accent)]">{error}</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/login` in a browser that supports platform passkeys (Chrome/Safari with Touch ID/Face ID, or a virtual authenticator in Chrome DevTools → More tools → WebAuthn).

Expected:
1. First visit shows "Set up your passkey" (no passkey registered yet).
2. Clicking it triggers the platform passkey prompt; on success, you land on `/admin` (a 404 for now — the route doesn't exist until Task 12, which is expected at this point).
3. Visiting `/login` again now shows "Sign in with passkey" instead.
4. Clicking it and completing the prompt redirects to `/admin` again.

- [ ] **Step 4: Commit**

```bash
git add app/login app/auth-actions.ts
git commit -m "feat: add teacher passkey login page"
```

---

### Task 10: Admin Server Actions

**Files:**
- Create: `app/actions.ts`

**Interfaces:**
- Consumes: `prisma` (Task 4), `getCurrentTeacher` (Task 7).
- Produces: `type CardInput`, `upsertGlobalCard(input: CardInput): Promise<void>`, `createGroup(name: string, slug: string): Promise<void>`, `upsertOverrideCard(groupId: string, input: CardInput): Promise<void>` from `@/app/actions` — consumed by the admin form components in Task 11.

- [ ] **Step 1: Write `app/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher } from "@/lib/session";

async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) throw new Error("Unauthorized");
  return teacher;
}

export type CardInput = {
  date: string; // YYYY-MM-DD
  frenchWord: string;
  wordType: string;
  pronunciation: string;
  englishPrompt: string;
  frenchAnswer: string;
  examples: string;
  tip: string;
};

function toCardData(input: CardInput) {
  return {
    frenchWord: input.frenchWord,
    wordType: input.wordType || null,
    pronunciation: input.pronunciation || null,
    englishPrompt: input.englishPrompt,
    frenchAnswer: input.frenchAnswer,
    examples: input.examples,
    tip: input.tip || null,
  };
}

export async function upsertGlobalCard(input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00`);

  await prisma.globalCard.upsert({
    where: { date },
    create: { date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath("/admin");
}

export async function createGroup(name: string, slug: string) {
  await requireTeacher();

  await prisma.group.create({ data: { name, slug } });

  revalidatePath("/admin");
}

export async function upsertOverrideCard(groupId: string, input: CardInput) {
  await requireTeacher();

  const date = new Date(`${input.date}T00:00:00`);

  await prisma.card.upsert({
    where: { groupId_date: { groupId, date } },
    create: { groupId, date, ...toCardData(input) },
    update: toCardData(input),
  });

  revalidatePath(`/admin`);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no errors — `groupId_date` matches the compound unique key Prisma generated from `@@unique([groupId, date])` on `Card`.

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add admin server actions for cards and groups"
```

---

### Task 11: Admin Form Components

**Files:**
- Create: `components/admin/CardForm.tsx`
- Create: `components/admin/NewGroupForm.tsx`

**Interfaces:**
- Consumes: `Input`, `Textarea`, `Button` (Task 3), `type CardInput` (Task 10).
- Produces: `<CardForm initialDate initialValues? onSubmit />` and `<NewGroupForm onSubmit />` — consumed by the admin pages in Task 12.

- [ ] **Step 1: Write `components/admin/CardForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { CardInput } from "@/app/actions";

export function CardForm({
  initialDate,
  initialValues,
  onSubmit,
}: {
  initialDate: string;
  initialValues?: Partial<CardInput>;
  onSubmit: (input: CardInput) => Promise<void>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CardInput>({
    date: initialDate,
    frenchWord: initialValues?.frenchWord ?? "",
    wordType: initialValues?.wordType ?? "",
    pronunciation: initialValues?.pronunciation ?? "",
    englishPrompt: initialValues?.englishPrompt ?? "",
    frenchAnswer: initialValues?.frenchAnswer ?? "",
    examples: initialValues?.examples ?? "",
    tip: initialValues?.tip ?? "",
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof CardInput>(key: K, value: CardInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Date
        <Input
          type="date"
          value={values.date}
          onChange={(e) => update("date", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        French word
        <Input
          value={values.frenchWord}
          onChange={(e) => update("frenchWord", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Word type / tense
        <Input
          value={values.wordType}
          onChange={(e) => update("wordType", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Pronunciation
        <Input
          value={values.pronunciation}
          onChange={(e) => update("pronunciation", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        English sentence to translate
        <Textarea
          value={values.englishPrompt}
          onChange={(e) => update("englishPrompt", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        French answer
        <Textarea
          value={values.frenchAnswer}
          onChange={(e) => update("frenchAnswer", e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Example sentences (one per line)
        <Textarea
          value={values.examples}
          onChange={(e) => update("examples", e.target.value)}
        />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Tip
        <Input value={values.tip} onChange={(e) => update("tip", e.target.value)} />
      </label>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save word"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write `components/admin/NewGroupForm.tsx`**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function NewGroupForm({
  onSubmit,
}: {
  onSubmit: (name: string, slug: string) => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(name, slug);
      setName("");
      setSlug("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Group name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="text-sm font-medium text-[var(--color-ink)]">
        Slug (used in the link, e.g. &quot;a1&quot;)
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>
      <Button type="submit" disabled={saving}>
        {saving ? "Creating..." : "Create group"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add components/admin/CardForm.tsx components/admin/NewGroupForm.tsx
git commit -m "feat: add admin card and group form components"
```

---

### Task 12: Admin Pages

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/admin/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentTeacher` (Task 7), `prisma` (Task 4), `upsertGlobalCard`/`createGroup`/`upsertOverrideCard` (Task 10), `CardForm`/`NewGroupForm` (Task 11), `logout` (Task 9).
- Produces: the two admin routes described in the spec — `/admin` (post today's global word, list/create groups, log out) and `/admin/[slug]` (per-group overrides).

- [ ] **Step 1: Write `app/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertGlobalCard, createGroup } from "@/app/actions";
import { logout } from "@/app/auth-actions";
import { CardForm } from "@/components/admin/CardForm";
import { NewGroupForm } from "@/components/admin/NewGroupForm";

export default async function AdminPage() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
            Today&apos;s word
          </h1>
          <form action={logout}>
            <button
              type="submit"
              className="font-[var(--font-body)] text-sm text-[var(--color-ink-muted)] underline"
            >
              Log out
            </button>
          </form>
        </div>
        <CardForm initialDate={today} onSubmit={upsertGlobalCard} />

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Groups
        </h2>
        <ul className="mb-6 flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/admin/${group.slug}`}
                className="text-[var(--color-accent)] underline"
              >
                {group.name} (/g/{group.slug})
              </Link>
            </li>
          ))}
          {groups.length === 0 && (
            <li className="text-sm text-[var(--color-ink-muted)]">
              No groups yet.
            </li>
          )}
        </ul>
        <NewGroupForm onSubmit={createGroup} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write `app/admin/[slug]/page.tsx`**

```tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentTeacher } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { upsertOverrideCard } from "@/app/actions";
import { CardForm } from "@/components/admin/CardForm";

export default async function GroupAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login");

  const { slug } = await params;
  const group = await prisma.group.findUnique({
    where: { slug },
    include: { cards: { orderBy: { date: "desc" } } },
  });
  if (!group) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-8 font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          {group.name} overrides
        </h1>
        <CardForm
          initialDate={today}
          onSubmit={(input) => upsertOverrideCard(group.id, input)}
        />

        <h2 className="mb-4 mt-12 font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
          Existing overrides
        </h2>
        <ul className="flex flex-col gap-1 font-[var(--font-body)] text-sm text-[var(--color-ink-muted)]">
          {group.cards.map((card) => (
            <li key={card.id}>
              {card.date.toISOString().slice(0, 10)} — {card.frenchWord}
            </li>
          ))}
          {group.cards.length === 0 && <li>No overrides yet.</li>}
        </ul>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in at `/login` (from Task 9), then visit `/admin`.

Expected:
1. Unauthenticated visit to `/admin` or `/admin/anything` redirects to `/login`.
2. After login, `/admin` shows the "Today's word" form and an empty groups list.
3. Submitting the form with a French word and English prompt saves successfully (no error, form stays populated after `router.refresh()`).
4. Creating a group with name "A1" and slug "a1" makes it appear in the groups list, linking to `/admin/a1`.
5. Visiting `/admin/a1` shows the override form and an empty "Existing overrides" list; submitting an override adds it to that list.

- [ ] **Step 4: Commit**

```bash
git add app/admin
git commit -m "feat: add admin pages for global word and group overrides"
```

---

### Task 13: Flashcard Component

**Files:**
- Create: `components/WordTag.tsx`
- Create: `components/Flashcard.tsx`

**Interfaces:**
- Consumes: `type CardContent` (Task 5).
- Produces: `<WordTag label />` and `<Flashcard card: CardContent />` — the flip-on-click component consumed by the student page in Task 15.

- [ ] **Step 1: Write `components/WordTag.tsx`**

```tsx
export function WordTag({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-[var(--color-accent-soft)] px-3 py-1 font-[var(--font-body)] text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Write `components/Flashcard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { WordTag } from "@/components/WordTag";
import type { CardContent } from "@/lib/card-resolution";

export function Flashcard({ card }: { card: CardContent }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="mx-auto h-80 w-full max-w-md cursor-pointer [perspective:1200px]"
      onClick={() => setFlipped((value) => !value)}
    >
      <motion.div
        className="relative h-full w-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)] [backface-visibility:hidden]">
          <h1 className="font-[var(--font-display)] text-5xl italic text-[var(--color-ink)]">
            {card.frenchWord}
          </h1>
          <p className="font-[var(--font-body)] text-lg text-[var(--color-ink-muted)]">
            {card.englishPrompt}
          </p>
          {card.wordType && <WordTag label={card.wordType} />}
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="font-[var(--font-display)] text-2xl italic text-[var(--color-ink)]">
            {card.frenchAnswer}
          </p>
          {card.examples && (
            <p className="whitespace-pre-line font-[var(--font-body)] text-sm text-[var(--color-ink-muted)]">
              {card.examples}
            </p>
          )}
          {card.pronunciation && (
            <p className="font-[var(--font-body)] text-xs text-[var(--color-ink-muted)]">
              {card.pronunciation}
            </p>
          )}
          {card.tip && <WordTag label={card.tip} />}
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add components/WordTag.tsx components/Flashcard.tsx
git commit -m "feat: add flashcard flip component"
```

---

### Task 14: Archive List Component

**Files:**
- Create: `components/ArchiveList.tsx`

**Interfaces:**
- Consumes: `cn` (Task 3).
- Produces: `<ArchiveList slug dates today selected />` — consumed by the student page in Task 15. Clicking a date does a client-side route transition (`router.push` with `{ scroll: false }`) so the page never fully reloads.

- [ ] **Step 1: Write `components/ArchiveList.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ArchiveList({
  slug,
  dates,
  today,
  selected,
}: {
  slug: string;
  dates: string[];
  today: string;
  selected: string;
}) {
  const router = useRouter();

  if (dates.length === 0) return null;

  return (
    <div className="mx-auto mt-10 flex max-w-md flex-wrap justify-center gap-2">
      {dates.map((date) => (
        <button
          key={date}
          onClick={() =>
            router.push(`/g/${slug}?date=${date}`, { scroll: false })
          }
          className={cn(
            "rounded-full px-3 py-1 font-[var(--font-body)] text-xs transition-colors",
            date === selected
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:opacity-80",
            date === today &&
              date !== selected &&
              "ring-1 ring-[var(--color-accent)]",
          )}
        >
          {date}
          {date === today ? " (today)" : ""}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add components/ArchiveList.tsx
git commit -m "feat: add archive date list component"
```

---

### Task 15: Student Group Page

**Files:**
- Create: `app/g/[slug]/page.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 4), `getEffectiveCard`/`getArchiveDates` (Task 6), `Flashcard` (Task 13), `ArchiveList` (Task 14).
- Produces: the public `/g/[slug]` route — the one page students bookmark, per the spec.

- [ ] **Step 1: Write `app/g/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveCard, getArchiveDates } from "@/lib/cards";
import { Flashcard } from "@/components/Flashcard";
import { ArchiveList } from "@/components/ArchiveList";

function parseDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date } = await searchParams;

  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) notFound();

  const selectedDate = parseDate(date);
  const [card, archiveDates] = await Promise.all([
    getEffectiveCard(group.id, selectedDate),
    getArchiveDates(group.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-12">
      <h1 className="mb-8 text-center font-[var(--font-body)] text-lg text-[var(--color-ink-muted)]">
        {group.name}
      </h1>

      {card ? (
        <Flashcard card={card} />
      ) : (
        <p className="text-center font-[var(--font-body)] text-[var(--color-ink-muted)]">
          Nothing posted yet — check back soon!
        </p>
      )}

      <ArchiveList
        slug={slug}
        dates={archiveDates.map((d) => d.toISOString().slice(0, 10))}
        today={today}
        selected={date ?? today}
      />
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. With the "A1" group and at least one global word and one override created in Task 12's verification:

Expected:
1. Visiting `/g/a1` shows the flashcard — French word large, English prompt beneath, word-type tag if set.
2. Clicking the card flips it via a smooth 3D rotation, revealing the French answer, examples, pronunciation, and tip.
3. Clicking again flips it back.
4. The archive strip below shows every date that has a global or override word, most recent first, with today marked.
5. Clicking a past date swaps the card content without a full page reload (no flash of blank page).
6. Visiting `/g/does-not-exist` returns a 404 page.
7. Visiting `/g/<slug-with-no-cards>` (create an empty group via `/admin` first) shows the "Nothing posted yet" message instead of a broken card.

- [ ] **Step 3: Commit**

```bash
git add app/g
git commit -m "feat: add public student flashcard page"
```

---

### Task 16: Final Integration Verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the entire app built in Tasks 1–15.
- Produces: confidence that the full CI pipeline (lint, typecheck, test, build) passes end-to-end and that the complete teacher → student flow works in a real browser.

- [ ] **Step 1: Run the full local CI sequence**

Run: `npm ci && npx prisma generate && npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: every command exits 0, matching `.github/workflows/ci.yml` exactly.

- [ ] **Step 2: End-to-end manual walkthrough**

Run: `npm run dev`. Using a fresh browser profile (or clearing cookies) to simulate a first-time setup:

1. Visit `/login`, register a passkey (teacher setup).
2. At `/admin`, post a global word for today.
3. Create two groups, e.g. "a1" and "advanced".
4. Post an override for "advanced" for today's date with a different word.
5. Open `/g/a1` in one tab and `/g/advanced` in another (or an incognito window, since no student login exists) — confirm `a1` shows the global word and `advanced` shows its override.
6. Flip both cards, confirm both faces render correctly.
7. In `/admin`, post tomorrow's global word (use a future date in the form) — confirm today's cards are unaffected, and that after that date arrives it would become "today's" word per the resolution logic already covered by the Task 5 tests.
8. Click "Log out" on `/admin` and confirm it redirects to `/login`, and that `/admin` now redirects to `/login` again on the next visit.

Expected: every step behaves as described in the design spec, with no console errors in the browser dev tools.

- [ ] **Step 3: Fix any issues found, re-run Step 1, and commit fixes if needed**

If Step 2 surfaces a bug, fix it in the relevant task's file, re-run the full CI sequence from Step 1, then commit:

```bash
git add -A
git commit -m "fix: address issues found in end-to-end verification"
```

If no issues are found, no commit is needed for this task.

---

## Note on Follow-Up Work

The design spec explicitly scopes out group deletion, dark mode, and student accounts for v1 — none of those are implemented by this plan, matching the spec's YAGNI list.
