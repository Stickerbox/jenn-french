# Student Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each student an email address and password for their own page, so `/g/[slug]`'s private surfaces open on a password instead of a permanent link, and Jenn ends up holding an email address per student.

**Architecture:** `email`, `passwordHash` and `claimedAt` become nullable columns on `Group`. A successful sign-in sets the cookie that already exists — `student-token-<slug>` = `group.chatToken` — so **no existing authorisation check changes**: `chatRole`, `shelfRole`, the chat POST route, the SSE stream and all five whiteboard routes keep asking the one question they ask today. What changes is how the token is obtained: `?k=` becomes a single-use invitation to create the account rather than a permanent key, and claiming rotates the token so every other copy of the invite goes inert.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 6 + SQLite, React 19, Tailwind v4 via PostCSS, Vitest, bcryptjs.

**Read first:** `docs/superpowers/specs/2026-08-03-student-login-design.md` — the design and, importantly, its *Rejected* section. Several obvious-looking simplifications in this plan are load-bearing and are explained there.

---

## Context an engineer new to this codebase needs

Five conventions in this repo will make this plan make sense. Violating any of them will get the work rejected in review.

1. **Logic belongs in `lib/`, as a pure function, with a test in `tests/lib/`.** Components and Prisma access are deliberately *not* unit-tested; the pure modules underneath them are. Every rule in this feature therefore lands in `lib/` first, tested, before any UI exists.
2. **Comments explain *why*, especially the counter-intuitive.** Most comments here record a decision and the failure that motivated it. Do not add comments that restate the code. Do not delete the ones this plan asks you to write — several of them are the only record of why a line exists.
3. **"Student" is the UI word, "Group" is the code word.** The model, the routes and the Prisma queries all say `group`; copy and new student-only modules say `student`. Match whichever layer you are in.
4. **Student-facing copy is French; Jenn-facing copy (the admin) is English.** The student never sees an action's internal error string — `components/student/AddLinkRow.tsx:29` documents this.
5. **Single process.** pm2 runs this app in fork mode, and `lib/chat-bus.ts` and `lib/whiteboard-live.ts` are only correct because of it. Anything held in memory inherits that constraint and must say so in a comment.

---

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `lib/student-credentials.ts` | What a student may type: email normalisation, password rules. Pure. |
| `lib/student-auth-labels.ts` | The French sentences those rules and failures map to. |
| `lib/student-gate.ts` | Which of six states a visitor to `/g/[slug]` is in. Pure. Sibling of `lib/chat-access.ts`. |
| `lib/login-throttle.ts` | Failed-attempt window. Pure transitions + a `globalThis` store. |
| `lib/password-hash.ts` | bcryptjs wrapper. Async only, injectable cost. |
| `app/student-auth-actions.ts` | Server actions: claim, sign in, sign out. |
| `components/student/StudentAuthPanel.tsx` | The form. Client component, French. |
| `tests/lib/student-credentials.test.ts` | |
| `tests/lib/student-auth-labels.test.ts` | |
| `tests/lib/student-gate.test.ts` | |
| `tests/lib/login-throttle.test.ts` | |
| `tests/lib/password-hash.test.ts` | |

**Modify:**

| File | Change |
|---|---|
| `prisma/schema.prisma` | three nullable columns on `Group` |
| `app/g/[slug]/page.tsx` | derive `unlocked` from the gate; render the panel and the two teacher notices |
| `app/actions.ts:144-162` | `regenerateStudentLinks` → `resetStudentSignIn`, also clearing the credential |
| `app/admin/page.tsx:99-118` | select and pass `email`/`claimedAt`; rename the action prop |
| `components/admin/GroupList.tsx` | claim state per tile; reset control |
| `package.json` | add bcryptjs |
| `CLAUDE.md` | Auth section, routes table, the Lesson chat paragraph about `chatToken` |

---

## Task 0: Preflight

**Execution note (2026-08-04):** this task's premise did not hold. The working
copy already had `.git` with full history, `node_modules`, and `.env`, so the
`git init`, baseline-import commit and `npm ci` were skipped as no-ops. Only
Step 3, the green baseline, was actually run — it passed (55 files, 537 tests).
The work was done on a `student-login` branch rather than on `main`.

This working copy was unpacked without `node_modules`, without `.env`, and **without a `.git` directory**. Every task below ends in a commit, so establish version control before writing code — otherwise there is no way to review or revert task by task.

- [x] **Step 1: Confirm or create the repository**

```bash
git rev-parse --is-inside-work-tree 2>/dev/null || git init
git status --short | head
```

If `git init` was needed, make one commit of the existing tree first so later diffs are readable:

```bash
git add -A
git commit -m "chore: import existing tree as baseline" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [x] **Step 2: Install dependencies and create the local env file**

`.env` is gitignored and holds only the database URL. Prisma reads it; Next reads it too.

```bash
npm ci
test -f .env || printf 'DATABASE_URL="file:./dev.db"\n' > .env
npx prisma generate
```

- [x] **Step 3: Establish a green baseline**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all three pass. **If anything fails here, stop and report it** — a red baseline means you cannot attribute a later failure to your own work.

---

## Task 1: Add bcryptjs

**Files:**
- Modify: `package.json`, `package-lock.json`

Why bcryptjs and not a native Argon2 binding: `npm ci` runs **on the production server**, a `t3.small` with 2 GB of RAM where, per `docs/DEPLOY.md:92`, "the build is the heaviest thing that ever runs". A native module there is either a prebuilt binary that must match the box or a node-gyp compile that thrashes swap. bcrypt is also named explicitly by the organisation's SEC-CRY-1.00 control, so it needs no documented exception.

- [x] **Step 1: Install**

```bash
npm install bcryptjs
```

- [x] **Step 2: Check whether it ships its own types**

```bash
node -e "console.log(require('fs').existsSync('node_modules/bcryptjs/index.d.ts') || require('fs').existsSync('node_modules/bcryptjs/types.d.ts'))"
```

Expected: `true` on bcryptjs 3.x, which is written in TypeScript. If it prints `false`, add the community types as a dev dependency instead:

```bash
npm install --save-dev @types/bcryptjs
```

- [x] **Step 3: Verify it imports and hashes**

```bash
node -e "const b=require('bcryptjs'); b.hash('x',4).then(h=>console.log(h.slice(0,7)))"
```

Expected: a prefix like `$2b$04$`.

- [x] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcryptjs for student password hashing" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

This is the commit that moves `package-lock.json`, so **the deploy carrying this
feature will take the slow path**: `deploy.sh` skips `npm ci` unless that file
changed, and here it has. Expect the deploy to run several minutes longer than
usual, once. No new environment variable is needed — bcryptjs takes no
configuration.

---

## Task 2: Schema migration

**Files:**
- Modify: `prisma/schema.prisma:10-30`
- Create: `prisma/migrations/<timestamp>_add_student_credentials/migration.sql` (generated)

- [x] **Step 1: Add the three columns**

In `prisma/schema.prisma`, inside `model Group`, directly after the `filesToken` line and before `teacherLastReadAt`:

```prisma
  // Null until the student claims their invite. Stored trimmed and lowercased,
  // because it is an identifier we compare on sign-in and will one day mail —
  // not a secret.
  //
  // Deliberately NOT @unique: sign-in is scoped to the slug in the URL, so
  // uniqueness buys nothing, and two siblings taught by Jenn share one parent's
  // inbox. A unique index would fail the second sign-up with nothing but a
  // constraint error to explain it.
  email             String?
  // bcrypt, cost 12. The salt lives inside the string — the bcrypt format
  // carries it, so there is no second column.
  passwordHash      String?
  // Displayed in the admin, and an audit fact: a claim at an hour Jenn does not
  // recognise is the signal that an invite leaked.
  claimedAt         DateTime?
```

- [x] **Step 2: Create and apply the migration**

```bash
npx prisma migrate dev --name add_student_credentials
```

Expected: a new directory under `prisma/migrations/`, and `Your database is now in sync with your schema.` No backfill and no data migration: existing rows come out `null` on all three, which reads as *unclaimed but holding a valid token* — exactly the intended behaviour for students already using the site.

- [x] **Step 3: Verify the columns exist and the generated client knows them**

```bash
npx prisma generate && npm run typecheck
node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().group.findMany({select:{slug:true,email:true,claimedAt:true}}).then(r=>console.log(r))"
```

Expected: typecheck passes; the query prints an array (possibly empty) rather than an unknown-column error.

- [x] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add email, passwordHash and claimedAt to Group" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: Credential rules

**Files:**
- Create: `lib/student-credentials.ts`
- Test: `tests/lib/student-credentials.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/lib/student-credentials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  checkPassword,
  normaliseEmail,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/student-credentials";

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Marie.Dupont@Example.COM ")).toBe(
      "marie.dupont@example.com",
    );
  });

  it("rejects blank input", () => {
    expect(normaliseEmail("   ")).toBeNull();
  });

  it("rejects an address with no dot in the domain", () => {
    expect(normaliseEmail("marie@example")).toBeNull();
  });

  it("rejects an address with no local part", () => {
    expect(normaliseEmail("@example.com")).toBeNull();
  });

  it("rejects internal whitespace", () => {
    expect(normaliseEmail("mar ie@example.com")).toBeNull();
  });

  it("rejects an address past 254 characters", () => {
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("accepts a plus-addressed mailbox", () => {
    expect(normaliseEmail("marie+francais@example.com")).toBe(
      "marie+francais@example.com",
    );
  });
});

describe("checkPassword", () => {
  it("accepts the minimum length", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("rejects one character short", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("too-short");
  });

  it("does not trim — spaces count toward the minimum", () => {
    expect(checkPassword("  abc   ")).toBeNull();
  });

  it("measures the maximum in bytes, not characters", () => {
    // 40 accented characters are 80 bytes in UTF-8 — past bcrypt's 72-byte
    // truncation point — even though `.length` is comfortably under it. A
    // `.length` check would let this through to be silently truncated.
    const accented = "é".repeat(40);
    expect(accented.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(checkPassword(accented)).toBe("too-long");
  });

  it("accepts exactly the byte limit and rejects one past it", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
    expect(checkPassword("a".repeat(MAX_PASSWORD_BYTES + 1))).toBe("too-long");
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

```bash
npx vitest run tests/lib/student-credentials.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/student-credentials"`.

- [x] **Step 3: Write the implementation**

Create `lib/student-credentials.ts`:

```ts
// What a student may type into the sign-in form. Pure, so the byte boundary
// below is provable in a test rather than discovered in production.

export type CredentialProblem = "bad-email" | "too-short" | "too-long";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const MIN_PASSWORD_LENGTH = 8;

// bcrypt silently truncates its input past 72 bytes, so two long passwords
// sharing a 72-byte prefix both verify against the same hash — see the last
// case in tests/lib/password-hash.test.ts, which pins that behaviour. Rejecting
// is the only honest answer, and the limit is in BYTES: this is a French site,
// "é" is two bytes in UTF-8, and a 40-character accented passphrase is already
// over the line while its `.length` is 40.
export const MAX_PASSWORD_BYTES = 72;

// TextEncoder rather than Buffer.byteLength: this module is imported by
// components/student/StudentAuthPanel.tsx, a client component, and Buffer is
// not available in the browser bundle.
const encoder = new TextEncoder();

// Trimmed and lowercased because this is an identifier we compare on sign-in
// and will one day mail. Deliberately loose about shape: the only authority on
// whether an address works is sending to it, and an over-strict pattern rejects
// addresses that do.
export function normaliseEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_SHAPE.test(trimmed)) return null;
  return trimmed;
}

// Deliberately NOT trimmed, unlike the email: trimming silently changes what
// someone typed, and their password manager's saved value would then stop
// matching what the form sends.
export function checkPassword(raw: string): CredentialProblem | null {
  if (raw.length < MIN_PASSWORD_LENGTH) return "too-short";
  if (encoder.encode(raw).length > MAX_PASSWORD_BYTES) return "too-long";
  return null;
}
```

- [x] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run tests/lib/student-credentials.test.ts
```

Expected: PASS, 12 tests.

- [x] **Step 5: Commit**

```bash
git add lib/student-credentials.ts tests/lib/student-credentials.test.ts
git commit -m "feat: add student email and password rules" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4: French copy for those rules

**Files:**
- Create: `lib/student-auth-labels.ts`
- Test: `tests/lib/student-auth-labels.test.ts`

The rule and the language it is announced in are two things. `lib/page-section-labels.ts` already makes this split for section headings — the same reason applies here, and it is what keeps `lib/student-credentials.ts` free of copy.

- [x] **Step 1: Write the failing test**

Create `tests/lib/student-auth-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  credentialProblemLabel,
  SIGN_IN_FAILED,
  TOO_MANY_TRIES,
  INVITE_USED,
  GENERIC_FAILURE,
} from "@/lib/student-auth-labels";
import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";

const PROBLEMS: CredentialProblem[] = ["bad-email", "too-short", "too-long"];

describe("credentialProblemLabel", () => {
  it("gives a distinct, non-empty sentence for every problem", () => {
    const sentences = PROBLEMS.map(credentialProblemLabel);
    expect(new Set(sentences).size).toBe(PROBLEMS.length);
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence.endsWith(".")).toBe(true);
    }
  });

  it("names the minimum it actually enforces, rather than a hardcoded number", () => {
    expect(credentialProblemLabel("too-short")).toContain(
      String(MIN_PASSWORD_LENGTH),
    );
  });
});

describe("the failure messages", () => {
  it("names both halves of the sign-in, so it cannot reveal which was wrong", () => {
    expect(SIGN_IN_FAILED).toContain("courriel");
    expect(SIGN_IN_FAILED).toContain("mot de passe");
  });

  it("points a locked-out or stranded student at Jenn, who is the only recovery", () => {
    expect(TOO_MANY_TRIES).toContain("Jenn");
    expect(INVITE_USED).toContain("Jenn");
  });

  it("keeps every message French and free of internal detail", () => {
    for (const message of [
      SIGN_IN_FAILED,
      TOO_MANY_TRIES,
      INVITE_USED,
      GENERIC_FAILURE,
    ]) {
      expect(message).not.toMatch(/error|invalid|unauthorized|prisma/i);
    }
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

```bash
npx vitest run tests/lib/student-auth-labels.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/student-auth-labels"`.

- [x] **Step 3: Write the implementation**

Create `lib/student-auth-labels.ts`:

```ts
import {
  MIN_PASSWORD_LENGTH,
  type CredentialProblem,
} from "@/lib/student-credentials";

// French, because the student reads these. Kept beside the rules rather than
// inside them for the reason lib/page-section-labels.ts exists: the rule is one
// thing and the language it is announced in is another.

export function credentialProblemLabel(problem: CredentialProblem): string {
  switch (problem) {
    case "bad-email":
      return "Ce courriel ne semble pas valide.";
    case "too-short":
      // Interpolated rather than written out, so raising the minimum cannot
      // leave the sentence claiming the old one.
      return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    case "too-long":
      return "Ce mot de passe est trop long.";
  }
}

// One message for every sign-in failure — wrong courriel, wrong mot de passe, or
// a student who has no account at all. Naming both halves is the point: it
// cannot reveal which one was wrong, and so cannot tell someone guessing slugs
// which students exist.
export const SIGN_IN_FAILED =
  "Le courriel ou le mot de passe ne correspond pas.";

export const TOO_MANY_TRIES =
  "Trop d'essais. Réessayez dans quinze minutes ou écrivez à Jenn.";

// Shown when an invite has already been spent. Jenn is named because she is the
// only recovery — nothing here sends email.
export const INVITE_USED =
  "Ce lien a déjà été utilisé. Écrivez à Jenn pour en recevoir un nouveau.";

export const GENERIC_FAILURE = "Une erreur est survenue. Réessayez.";
```

- [x] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run tests/lib/student-auth-labels.test.ts
```

Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add lib/student-auth-labels.ts tests/lib/student-auth-labels.test.ts
git commit -m "feat: add French copy for student sign-in" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5: The gate

**Files:**
- Create: `lib/student-gate.ts`
- Test: `tests/lib/student-gate.test.ts`

Read `lib/chat-access.ts` and `lib/shelf-access.ts` first — this is a third sibling and must look like them. It returns a string rather than a bag of booleans so the page gets one `switch` and this test can enumerate the whole state space.

- [x] **Step 1: Write the failing test**

Create `tests/lib/student-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { studentGate } from "@/lib/student-gate";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "tok" as string | null,
  presented: null as string | null,
  claimed: false,
};

describe("studentGate", () => {
  it("refuses the everyone group before anything else can admit it", () => {
    expect(
      studentGate({
        ...base,
        isEveryone: true,
        isTeacher: true,
        presented: "tok",
        claimed: true,
      }),
    ).toBe("none");
  });

  it("refuses a group with no token at all", () => {
    expect(studentGate({ ...base, chatToken: null, presented: "tok" })).toBe(
      "none",
    );
  });

  it("cannot be entered by presenting the string null", () => {
    expect(studentGate({ ...base, chatToken: null, presented: "null" })).toBe(
      "none",
    );
  });

  it("signs in a claimed student holding the current token", () => {
    expect(studentGate({ ...base, presented: "tok", claimed: true })).toBe(
      "signed-in",
    );
  });

  it("offers sign-up to an unclaimed student holding a live invite", () => {
    expect(studentGate({ ...base, presented: "tok" })).toBe("signup");
  });

  it("offers sign-in identically whether or not the student is claimed", () => {
    // The security requirement behind the terminal clause: the presence of the
    // form must not tell a slug-guesser which students exist.
    expect(studentGate({ ...base, claimed: true })).toBe("login");
    expect(studentGate({ ...base, claimed: false })).toBe("login");
  });

  it("offers sign-in on a spent or wrong token", () => {
    expect(studentGate({ ...base, presented: "old", claimed: true })).toBe(
      "login",
    );
  });

  it("never offers the teacher a form she could claim a student with", () => {
    expect(studentGate({ ...base, isTeacher: true, presented: "tok" })).toBe(
      "unclaimed",
    );
    expect(studentGate({ ...base, isTeacher: true, presented: null })).toBe(
      "unclaimed",
    );
  });

  it("tells the teacher her link is stale rather than showing a student form", () => {
    expect(
      studentGate({
        ...base,
        isTeacher: true,
        claimed: true,
        presented: "old",
      }),
    ).toBe("teacher-stale");
    expect(
      studentGate({ ...base, isTeacher: true, claimed: true, presented: null }),
    ).toBe("teacher-stale");
  });

  it("signs the teacher in when she holds the current token", () => {
    expect(
      studentGate({
        ...base,
        isTeacher: true,
        claimed: true,
        presented: "tok",
      }),
    ).toBe("signed-in");
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

```bash
npx vitest run tests/lib/student-gate.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/student-gate"`.

- [x] **Step 3: Write the implementation**

Create `lib/student-gate.ts`:

```ts
// Which of six states a visitor to /g/[slug] is in. A third sibling of
// chatRole (lib/chat-access.ts) and shelfRole (lib/shelf-access.ts), written
// here rather than inline in the page for the reason chatRole gives: a rule
// duplicated across two files is a rule that will eventually differ in one of
// them, and the difference would be a hole rather than a bug report.
export type StudentGate =
  | "none" // nothing to sign in to
  | "signed-in" // the old `unlocked`
  | "unclaimed" // teacher, student has not signed up yet
  | "teacher-stale" // teacher, claimed, her token is out of date
  | "signup" // holds a live invite, no account yet
  | "login"; // everyone else

// The ORDER of these clauses is the specification. Each comment records the
// failure that put the clause where it is.
export function studentGate(input: {
  isTeacher: boolean;
  isEveryone: boolean;
  chatToken: string | null;
  presented: string | null;
  claimed: boolean;
}): StudentGate {
  // Refused first, as chatRole refuses it, so that no later clause can admit
  // the everyone group by accident. It has no chatToken, so there is nothing to
  // sign in to and never will be.
  if (input.isEveryone || input.chatToken === null) return "none";

  // chatToken is non-null past the clause above, which is what makes this
  // comparison safe: a group with no token must never be enterable by
  // presenting the string "null".
  const holdsToken = input.presented === input.chatToken;

  if (holdsToken && input.claimed) return "signed-in";

  // Jenn opens student pages from the admin, with ?k= in the URL. Without this
  // clause she would be handed the sign-up form for a student who has not
  // signed up yet — and could complete it, claiming their account herself.
  if (input.isTeacher && !input.claimed) return "unclaimed";

  // A claim rotates the chatToken, so her stored cookie for that slug goes
  // stale the moment a student signs up. Without this clause she would land on
  // her own student's page and be shown a *student sign-in form*, which invites
  // exactly the wrong action. The admin's link always carries the current
  // token, so this is a one-click fix.
  if (input.isTeacher) return "teacher-stale";

  if (holdsToken) return "signup";

  // Not a fallback — a security requirement. The form renders identically
  // whether or not this student has an account, so its presence cannot tell
  // someone guessing slugs which students exist and which are still claimable.
  return "login";
}
```

- [x] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run tests/lib/student-gate.test.ts
```

Expected: PASS, 10 tests.

- [x] **Step 5: Commit**

```bash
git add lib/student-gate.ts tests/lib/student-gate.test.ts
git commit -m "feat: add studentGate access rule" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6: Failed-attempt throttle

**Files:**
- Create: `lib/login-throttle.ts`
- Test: `tests/lib/login-throttle.test.ts`

Split deliberately in two halves in one file: pure transitions that take `now` as an argument (so the window arithmetic is provable without a `sleep`), and a thin `globalThis`-held store around them. Copy the `globalThis` idiom from `lib/prisma.ts:3-11` and `lib/chat-bus.ts:4-22`.

- [x] **Step 1: Write the failing test**

Create `tests/lib/login-throttle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isLocked,
  recordFailure,
  MAX_FAILURES,
  WINDOW_MS,
  type AttemptState,
} from "@/lib/login-throttle";

// A fake clock, passed in: the window is fifteen minutes and no test may wait.
function failTimes(times: number, at = 0): AttemptState {
  let state: AttemptState | undefined;
  for (let i = 0; i < times; i += 1) state = recordFailure(state, at);
  return state as AttemptState;
}

describe("login throttle", () => {
  it("is not locked with no history", () => {
    expect(isLocked(undefined, 0)).toBe(false);
  });

  it("is not locked one attempt short of the maximum", () => {
    expect(isLocked(failTimes(MAX_FAILURES - 1), 0)).toBe(false);
  });

  it("locks on the attempt that reaches the maximum", () => {
    expect(isLocked(failTimes(MAX_FAILURES), 0)).toBe(true);
  });

  it("stays locked anywhere inside the window", () => {
    expect(isLocked(failTimes(MAX_FAILURES), WINDOW_MS - 1)).toBe(true);
  });

  it("releases itself once the window has passed, with no intervention", () => {
    expect(isLocked(failTimes(MAX_FAILURES), WINDOW_MS)).toBe(false);
  });

  it("counts from the first failure, not the most recent", () => {
    // Otherwise every new attempt would push the window forward and a slow
    // attacker would never trip it.
    expect(recordFailure(failTimes(2), 1000).firstFailureAt).toBe(0);
  });

  it("starts a fresh window rather than accumulating forever", () => {
    // Nine wrong guesses, a long silence, then one more: a forgetful student,
    // not an attack. The count restarts instead of tipping over the limit.
    const later = recordFailure(failTimes(MAX_FAILURES - 1), WINDOW_MS + 1);
    expect(later.failures).toBe(1);
    expect(isLocked(later, WINDOW_MS + 1)).toBe(false);
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

```bash
npx vitest run tests/lib/login-throttle.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/login-throttle"`.

- [x] **Step 3: Write the implementation**

Create `lib/login-throttle.ts`:

```ts
// Ten wrong guesses for one student inside fifteen minutes locks that student's
// sign-in for fifteen minutes. A success clears it.
//
// Keyed by slug, not by IP. The attack is against one student, and an IP behind
// nginx means trusting X-Forwarded-For, a header the client sets. The accepted
// cost is that someone who knows a slug can lock that student out on purpose:
// bounded to fifteen minutes, self-healing, no action needed from Jenn — a
// better failure than a limit anyone can bypass by varying a header.

export type AttemptState = { failures: number; firstFailureAt: number };

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

// The pure half. `now` is an argument so the window arithmetic is provable in a
// test with a fake clock rather than a sleep.
export function recordFailure(
  state: AttemptState | undefined,
  now: number,
): AttemptState {
  // An expired window starts over rather than accumulating forever: ten wrong
  // guesses spread across a year are a forgetful student, not an attack.
  if (!state || now - state.firstFailureAt >= WINDOW_MS) {
    return { failures: 1, firstFailureAt: now };
  }
  // firstFailureAt is carried, not refreshed — otherwise each new attempt would
  // push the window forward and a slow attacker would never trip the limit.
  return {
    failures: state.failures + 1,
    firstFailureAt: state.firstFailureAt,
  };
}

export function isLocked(
  state: AttemptState | undefined,
  now: number,
): boolean {
  if (!state) return false;
  if (now - state.firstFailureAt >= WINDOW_MS) return false;
  return state.failures >= MAX_FAILURES;
}

// The stateful half. Held on globalThis for the same reason lib/prisma.ts and
// lib/chat-bus.ts are: dev's module reloading would otherwise hand each reload
// a fresh Map and reset every counter on each edit.
//
// This is correct ONLY because pm2 runs this app as a single process in fork
// mode. Under cluster mode each worker would keep its own counter and the limit
// would silently become as many times looser as there are workers — the same
// trap the chat bus and the live whiteboard carry. See docs/DEPLOYMENT.md
// before changing how the app is started.
const globalForThrottle = globalThis as unknown as {
  loginAttempts: Map<string, AttemptState> | undefined;
};

const attempts =
  globalForThrottle.loginAttempts ?? new Map<string, AttemptState>();

if (process.env.NODE_ENV !== "production") {
  globalForThrottle.loginAttempts = attempts;
}

export function isSlugLocked(slug: string, now = Date.now()): boolean {
  return isLocked(attempts.get(slug), now);
}

export function noteFailure(slug: string, now = Date.now()): void {
  attempts.set(slug, recordFailure(attempts.get(slug), now));
}

export function clearAttempts(slug: string): void {
  attempts.delete(slug);
}
```

- [x] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run tests/lib/login-throttle.test.ts
```

Expected: PASS, 7 tests.

- [x] **Step 5: Commit**

```bash
git add lib/login-throttle.ts tests/lib/login-throttle.test.ts
git commit -m "feat: add per-student sign-in throttle" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7: Password hashing

**Files:**
- Create: `lib/password-hash.ts`
- Test: `tests/lib/password-hash.test.ts`

- [x] **Step 1: Write the failing test**

Create `tests/lib/password-hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password-hash";

// Cost 4, not the production 12: a cost-12 hash is roughly 300ms and this file
// wants several. The cost is a parameter for exactly this reason.
const TEST_COST = 4;

describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    await expect(verifyPassword("bonjour-québec", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    await expect(verifyPassword("bonjour-quebec", hash)).resolves.toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const first = await hashPassword("bonjour-québec", TEST_COST);
    const second = await hashPassword("bonjour-québec", TEST_COST);
    expect(first).not.toBe(second);
    await expect(verifyPassword("bonjour-québec", second)).resolves.toBe(true);
  });

  it("produces a recognisable bcrypt string", async () => {
    const hash = await hashPassword("bonjour-québec", TEST_COST);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("truncates past 72 bytes — which is why checkPassword rejects longer input", async () => {
    // Pinned here so nobody "cleans up" MAX_PASSWORD_BYTES without seeing what
    // it defends: two different passwords sharing a 72-byte prefix verify
    // against the same hash.
    const prefix = "a".repeat(72);
    const hash = await hashPassword(`${prefix}ONE`, TEST_COST);
    await expect(verifyPassword(`${prefix}TWO`, hash)).resolves.toBe(true);
  });
});
```

**If that last assertion fails** because the installed bcryptjs *rejects* over-long input rather than truncating it, do not delete the test — invert it to assert the rejection it actually performs, and keep `MAX_PASSWORD_BYTES` either way. The point of the test is to record the library's real behaviour at the boundary.

- [x] **Step 2: Run it to make sure it fails**

```bash
npx vitest run tests/lib/password-hash.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/password-hash"`.

- [x] **Step 3: Write the implementation**

Create `lib/password-hash.ts`:

```ts
import bcrypt from "bcryptjs";

// Cost 12 in production. A parameter rather than a bare constant because a
// cost-12 hash is roughly 300ms and the tests want several of them — the same
// injection lib/whiteboard-hit.ts uses for its text measurer, and for the same
// reason: keep the module cheap to test without weakening what ships.
export const DEFAULT_COST = 12;

// The async form, never bcrypt.hashSync. One pm2 fork process serves every SSE
// stream in this app, and a 300ms synchronous hash stalls the ": ping" comments
// that keep those streams inside nginx's 60-second proxy_read_timeout — so a
// sync hash here is a broken chat, not a style preference.
export function hashPassword(
  password: string,
  cost: number = DEFAULT_COST,
): Promise<string> {
  return bcrypt.hash(password, cost);
}

// No cost argument: bcrypt carries the cost and the salt inside the hash
// string, so verifying uses whatever the stored value was written with.
export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [x] **Step 4: Run the tests and make sure they pass**

```bash
npx vitest run tests/lib/password-hash.test.ts
```

Expected: PASS, 5 tests.

- [x] **Step 5: Run the whole suite, then commit**

```bash
npm test
```

Expected: every test passes, including the 34 pre-existing files.

```bash
git add lib/password-hash.ts tests/lib/password-hash.test.ts
git commit -m "feat: add bcrypt password hashing wrapper" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8: Server actions

**Files:**
- Create: `app/student-auth-actions.ts`

No unit test: this file talks to Prisma and to the cookie store, and this codebase deliberately does not unit-test either — the rules underneath it are what Tasks 3–7 tested. It is verified by typecheck here and by the manual script in Task 14.

Two departures from `app/actions.ts` worth understanding before you write it:

- **These actions return a result instead of throwing.** Everywhere else in this codebase an action throws and the client maps the failure to one French sentence. Here the messages *are* the product — a specific "at least 8 characters" for validation, one deliberately uniform sentence for every sign-in failure — and a thrown `Error` would either leak an internal string or lose that distinction.
- **They do not call `requireTeacher`.** They are the student's entry point. What authorises a claim is the invite token, read from the cookie server-side.

- [x] **Step 1: Write the file**

Create `app/student-auth-actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cookieNameFor, newToken } from "@/lib/student-tokens";
import { checkPassword, normaliseEmail } from "@/lib/student-credentials";
import {
  credentialProblemLabel,
  GENERIC_FAILURE,
  INVITE_USED,
  SIGN_IN_FAILED,
  TOO_MANY_TRIES,
} from "@/lib/student-auth-labels";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { clearAttempts, isSlugLocked, noteFailure } from "@/lib/login-throttle";

// A year, matching what middleware.ts sets when it moves ?k= into a cookie.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// A result rather than a thrown Error, unlike every action in app/actions.ts.
// The message is the product here: specific for validation, deliberately
// uniform for every sign-in failure, and never an internal string.
export type AuthResult = { ok: true } | { error: string };

async function setStudentCookie(slug: string, token: string) {
  const store = await cookies();
  // Identical to what middleware.ts sets, deliberately — including path "/"
  // rather than /g/<slug>, because a path-scoped cookie would never be sent to
  // /api/chat/<slug>. The per-student NAME is what keeps students separate.
  store.set(cookieNameFor(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// The first sign-in IS the sign-up. What authorises it is the invite token,
// which this reads from the cookie itself: hiding the form is not a guard, the
// same reason deleteGroup re-checks canDeleteGroup server-side.
export async function claimStudent(
  slug: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  // Before any hashing: hashing is expensive on purpose, so an unthrottled
  // endpoint that hashes attacker input is a CPU-exhaustion vector against a
  // two-core box.
  if (isSlugLocked(slug)) return { error: TOO_MANY_TRIES };

  const normalised = normaliseEmail(email);
  if (normalised === null) return { error: credentialProblemLabel("bad-email") };

  const problem = checkPassword(password);
  if (problem !== null) return { error: credentialProblemLabel(problem) };

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { id: true, isEveryone: true, chatToken: true },
  });
  if (!group || group.isEveryone || group.chatToken === null) {
    return { error: GENERIC_FAILURE };
  }

  const store = await cookies();
  const presented = store.get(cookieNameFor(slug))?.value ?? null;
  if (presented !== group.chatToken) {
    noteFailure(slug);
    return { error: INVITE_USED };
  }

  // Rotating the token is what SPENDS the invitation, and it is load-bearing
  // rather than tidy: `unlocked` is holdsToken && claimed, so the moment this
  // student is claimed, any other copy of this same invite link would satisfy
  // both halves and be admitted WITHOUT a password.
  const freshToken = newToken();
  const passwordHash = await hashPassword(password);

  // A conditional update rather than a transaction: two submissions racing both
  // read "unclaimed", and the loser must not overwrite the winner's account.
  const { count } = await prisma.group.updateMany({
    where: { id: group.id, passwordHash: null },
    data: {
      email: normalised,
      passwordHash,
      claimedAt: new Date(),
      chatToken: freshToken,
    },
  });
  if (count !== 1) return { error: INVITE_USED };

  await setStudentCookie(slug, freshToken);
  clearAttempts(slug);

  // No chatBus.publishRevoke here, unlike resetStudentSignIn, and the absence
  // is deliberate: before a claim nobody is signed in, because `unlocked`
  // requires `claimed`, so there is no open stream on this group to revoke.

  // Slug only. The email is PII and never goes into a log.
  console.info(`[student-auth] claimed ${slug}`);
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

export async function signInStudent(
  slug: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  if (isSlugLocked(slug)) return { error: TOO_MANY_TRIES };

  const normalised = normaliseEmail(email);

  const group = await prisma.group.findUnique({
    where: { slug },
    select: { isEveryone: true, chatToken: true, email: true, passwordHash: true },
  });
  if (!group || group.isEveryone || group.chatToken === null) {
    noteFailure(slug);
    return { error: SIGN_IN_FAILED };
  }

  // Both checks are computed BEFORE the branch below, so a wrong email cannot
  // skip the hash and turn "no such student" into a measurably faster answer.
  let passwordOk = false;
  if (group.passwordHash !== null) {
    passwordOk = await verifyPassword(password, group.passwordHash);
  } else {
    // No account here. Hash the submitted password and throw the result away,
    // so an unclaimed student costs the same as a wrong password — an instant
    // failure would tell someone guessing slugs which students are claimable.
    await hashPassword(password);
  }

  const emailOk =
    normalised !== null && group.email !== null && normalised === group.email;

  if (!emailOk || !passwordOk) {
    noteFailure(slug);
    // One message for every failure. Never which half was wrong.
    return { error: SIGN_IN_FAILED };
  }

  await setStudentCookie(slug, group.chatToken);
  clearAttempts(slug);
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

// Deletes the one cookie. Signing out is not revocation and rotates nothing —
// the shared family laptop is the case this exists for.
export async function signOutStudent(slug: string): Promise<void> {
  const store = await cookies();
  // The object form, with the same path the cookie was set with: deleting by
  // bare name would not match a cookie scoped to "/".
  store.delete({ name: cookieNameFor(slug), path: "/" });
  revalidatePath(`/g/${slug}`);
}
```

- [x] **Step 2: Verify it compiles and lints**

```bash
npm run typecheck && npm run lint
```

Expected: both pass.

- [x] **Step 3: Commit**

```bash
git add app/student-auth-actions.ts
git commit -m "feat: add student claim, sign-in and sign-out actions" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: The sign-in panel

**Files:**
- Create: `components/student/StudentAuthPanel.tsx`

Model it on `components/student/AddLinkRow.tsx` — same French copy, same `fieldClassName` reuse, same `--card-*` palette, same `router.refresh()` after a successful action. Its classes stay inline rather than moving to `components/card-styles.ts`, which is for strings repeated across flashcard components; these are used once, exactly as `AddLinkRow`'s are.

- [x] **Step 1: Write the component**

Create `components/student/StudentAuthPanel.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { StudentGate } from "@/lib/student-gate";
import {
  claimStudent,
  signInStudent,
  signOutStudent,
} from "@/app/student-auth-actions";
import {
  checkPassword,
  normaliseEmail,
  MIN_PASSWORD_LENGTH,
} from "@/lib/student-credentials";
import {
  credentialProblemLabel,
  GENERIC_FAILURE,
} from "@/lib/student-auth-labels";

// Tied to the gate's own type, so a new gate state cannot quietly bypass this
// component. The two teacher-facing states are rendered by the page itself:
// they are static English text, and one of them contains the student's NAME,
// which must never appear on the public page.
export type AuthPanelMode = Extract<
  StudentGate,
  "signup" | "login" | "signed-in"
>;

const linkButton =
  "font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline";

export function StudentAuthPanel({
  slug,
  mode,
}: {
  slug: string;
  mode: AuthPanelMode;
}) {
  const router = useRouter();
  // Sign-up arrives on an invite and came to do exactly one thing, so its form
  // is open. Sign-in collapses to one line, which is what keeps the public
  // untokened page as bare as it was before accounts existed.
  const [open, setOpen] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    await signOutStudent(slug);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as in the action, so a typo does not cost a round
    // trip. This is a convenience: the action re-checks, because a disabled
    // button is not a guard.
    if (normaliseEmail(email) === null) {
      setError(credentialProblemLabel("bad-email"));
      return;
    }
    const problem = checkPassword(password);
    if (problem !== null) {
      setError(credentialProblemLabel(problem));
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === "signup"
          ? await claimStudent(slug, email, password)
          : await signInStudent(slug, email, password);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      // The action's failures already arrive as French sentences; this is the
      // network or a crash, and the student still gets one French sentence
      // rather than a leaked internal string.
      setError(GENERIC_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "signed-in") {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-[560px] justify-end">
        <button type="button" onClick={handleSignOut} className={linkButton}>
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mx-auto mb-6 w-full max-w-[560px] text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={linkButton}
        >
          Vous avez un compte ? Se connecter
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5"
    >
      <p className="mb-3 font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)]">
        {mode === "signup"
          ? "Créez votre compte pour accéder à vos documents et au clavardage."
          : "Connectez-vous pour accéder à vos documents et au clavardage."}
      </p>

      {/* Both fields in ONE form, submitted together. This is the whole of
          "make password managers pick it up": a manager keys off an identifier
          field and a password field in the same submission, and splitting them
          across two steps is the usual way that gets broken. */}
      <label
        htmlFor="student-email"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Courriel
      </label>
      <input
        id="student-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={cn(fieldClassName, "mb-3")}
      />

      <label
        htmlFor="student-password"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Mot de passe
      </label>
      <input
        id="student-password"
        name="password"
        type={reveal ? "text" : "password"}
        // new-password on sign-up asks the manager to offer a generated one and
        // save it; current-password on sign-in asks it to fill.
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={cn(fieldClassName, "mb-2")}
      />

      <div className="mb-4 flex justify-between">
        <button
          type="button"
          onClick={() => setReveal(!reveal)}
          className={linkButton}
        >
          {reveal ? "Masquer" : "Afficher"} le mot de passe
        </button>
        {mode === "login" && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={linkButton}
          >
            Annuler
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
      >
        {mode === "signup"
          ? busy
            ? "Création…"
            : "Créer mon compte"
          : busy
            ? "Connexion…"
            : "Se connecter"}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-3 text-center text-sm text-[var(--card-rouge)]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
```

- [x] **Step 2: Verify it compiles and lints**

```bash
npm run typecheck && npm run lint
```

Expected: both pass. If ESLint objects to the nested ternary in the submit label, split it into a `const label` computed above the `return` rather than disabling the rule.

- [x] **Step 3: Commit**

```bash
git add components/student/StudentAuthPanel.tsx
git commit -m "feat: add student sign-in panel" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10: Wire the student page to the gate

**Files:**
- Modify: `app/g/[slug]/page.tsx`

- [x] **Step 1: Add the two imports**

After the existing `import { getCurrentTeacher } from "@/lib/session";` line, add:

```ts
import { studentGate } from "@/lib/student-gate";
import { StudentAuthPanel } from "@/components/student/StudentAuthPanel";
```

- [x] **Step 2: Replace the group query and the `unlocked` computation**

Find this block (currently `app/g/[slug]/page.tsx:44-62`):

```ts
  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) notFound();

  // The card is public; everything else needs the token. An untokened visitor
  // sees exactly what this page rendered before chat existed.
  const presented = readToken(
    undefined,
    (await cookies()).get(cookieNameFor(slug))?.value,
  );
  const unlocked =
    !group.isEveryone &&
    group.chatToken !== null &&
    presented === group.chatToken;

  // Jenn opens a student's page from the admin. chatRole already treats her
  // session as the teacher regardless of the token, so the only thing left is
  // giving her the two controls that used to live on /admin/[slug].
  const teacher = await getCurrentTeacher();
  const viewerIsTeacher = Boolean(teacher);
```

Replace it with:

```ts
  // An explicit select rather than the whole row, because one of these columns
  // is a password hash and this file renders into a client tree. It is read for
  // exactly one boolean, on the next line, and never referenced again.
  const group = await prisma.group.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      isEveryone: true,
      chatToken: true,
      passwordHash: true,
    },
  });
  if (!group) notFound();

  // The card is public; everything else needs the token AND an account. An
  // untokened visitor sees exactly what this page rendered before chat existed.
  const presented = readToken(
    undefined,
    (await cookies()).get(cookieNameFor(slug))?.value,
  );

  // Jenn opens a student's page from the admin. chatRole already treats her
  // session as the teacher regardless of the token, so the only thing left is
  // giving her the two controls that used to live on /admin/[slug].
  const teacher = await getCurrentTeacher();
  const viewerIsTeacher = Boolean(teacher);

  // One rule, in one place, with a test that enumerates every state — see
  // lib/student-gate.ts. `unlocked` is derived from it rather than computed
  // beside it, so the panel and the tabs cannot disagree about who is signed in.
  const gate = studentGate({
    isTeacher: viewerIsTeacher,
    isEveryone: group.isEveryone,
    chatToken: group.chatToken,
    presented,
    claimed: group.passwordHash !== null,
  });
  const unlocked = gate === "signed-in";
```

- [x] **Step 3: Render the panel and the two teacher notices**

Find the `<StudentTabs …/>` block (currently `app/g/[slug]/page.tsx:167-174`) and insert directly **after** its closing `)}`:

```tsx
      {(gate === "signup" || gate === "login" || gate === "signed-in") && (
        <StudentAuthPanel slug={slug} mode={gate} />
      )}

      {/* Teacher-facing, and therefore English and static — no client component
          needed. Rendered here rather than inside StudentAuthPanel because both
          notices name the STUDENT, and the student's name is deliberately
          absent from the public page. Keeping it on a teacher-only branch is
          what stops a public visitor's HTML from ever containing it. */}
      {gate === "unclaimed" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          <p className="mb-2">
            {group.name} hasn&apos;t signed up yet. Share this link once — it
            lets them create their account:
          </p>
          <code className="break-all text-xs">
            /g/{slug}?k={group.chatToken}
          </code>
        </div>
      )}

      {gate === "teacher-stale" && (
        <div className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5 text-sm text-[var(--card-ink)]">
          Your link for {group.name} is out of date — {group.name} has signed up
          since, which changes it. Open this student from the admin Students tab
          to unlock the chat and boards.
        </div>
      )}
```

- [x] **Step 4: Verify**

```bash
npm run typecheck && npm run lint
```

Expected: both pass. If typecheck complains that `group.name` does not exist, the `select` in Step 2 is missing `name: true`.

- [x] **Step 5: Commit**

```bash
git add app/g/[slug]/page.tsx
git commit -m "feat: gate the student page on an account, not just a token" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 11: Reset sign-in

**Files:**
- Modify: `app/actions.ts:144-162`

`regenerateStudentLinks` becomes `resetStudentSignIn`. After this feature the two are the same operation: clearing the password without rotating the token would leave whoever is signed in still signed in, because their cookie holds that token.

- [x] **Step 1: Replace the action**

Replace `app/actions.ts:144-162` in full:

```ts
// Was regenerateStudentLinks. After student sign-in these are one operation:
// clearing the credential without rotating the token would leave whoever is
// signed in still signed in, because their cookie holds that token — which is
// exactly the case this exists for, evicting a stranger who claimed an invite
// that leaked.
//
// Both tokens move together, as they did before: a link that leaked probably
// leaked from the same place as its sibling.
export async function resetStudentSignIn(groupId: string) {
  await requireTeacher();

  const group = await prisma.group.update({
    where: { id: groupId },
    data: {
      chatToken: newToken(),
      filesToken: newToken(),
      email: null,
      passwordHash: null,
      claimedAt: null,
    },
    select: { slug: true },
  });

  // A token check only happens when a stream connects, so without this a tab
  // left open on a leaked link would keep receiving messages after the link
  // was supposedly revoked, until that connection happened to drop on its
  // own. Published after the update commits, so a stream that reconnects
  // immediately always sees the new token already in place.
  chatBus.publishRevoke(groupId);

  console.info(`[student-auth] reset ${group.slug}`);

  revalidatePath("/admin");
  // The student's own page too: her gate state changed from under her.
  revalidatePath(`/g/${group.slug}`);
}
```

- [x] **Step 2: Confirm nothing still references the old name**

```bash
grep -rn "regenerateStudentLinks" app components lib tests
```

Expected: two hits, both fixed in Task 12 — `app/admin/page.tsx:9` and `app/admin/page.tsx:117`. If `grep` finds any others, update them the same way.

- [x] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "feat: replace regenerateStudentLinks with resetStudentSignIn" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Typecheck will fail until Task 12 lands, because `app/admin/page.tsx` still imports the old name. That is expected for this one commit.

---

## Task 12: Admin claim state

**Files:**
- Modify: `app/admin/page.tsx:6-9`, `app/admin/page.tsx:99-118`
- Modify: `components/admin/GroupList.tsx`

- [x] **Step 1: Update the admin page's import and mapping**

In `app/admin/page.tsx`, change the import on line 9 from `regenerateStudentLinks,` to `resetStudentSignIn,`.

Then replace the `<GroupList …/>` call (lines 107-118) with:

```tsx
      <GroupList
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          isEveryone: g.isEveryone,
          unread: unread.get(g.id) ?? 0,
          chatToken: g.chatToken,
          email: g.email,
          claimedAt: g.claimedAt,
        }))}
        onDelete={deleteGroup}
        onReset={resetStudentSignIn}
      />
```

This explicit mapping is what keeps `passwordHash` on the server — `findMany` selects every column, and the map is the boundary. **Do not** replace it with a spread.

- [x] **Step 2: Extend `GroupSummary` and the props in `GroupList.tsx`**

Replace lines 10-27 of `components/admin/GroupList.tsx`:

```tsx
export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  isEveryone: boolean;
  unread: number;
  chatToken: string | null;
  // Null until the student signs up. Both move together, so either one answers
  // "claimed?" — email is the one displayed.
  email: string | null;
  claimedAt: Date | null;
};

export function GroupList({
  groups,
  onDelete,
  onReset,
}: {
  groups: GroupSummary[];
  onDelete: (groupId: string) => Promise<void>;
  onReset: (groupId: string) => Promise<void>;
}) {
```

- [x] **Step 3: Rename the reset handler's state and function**

In the same file, replace lines 32-33:

```tsx
  const [confirmingReset, setConfirmingReset] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
```

and replace `handleRegenerate` (lines 52-64) with:

```tsx
  async function handleReset(id: string) {
    setResetting(id);
    setError(null);
    try {
      await onReset(id);
      setConfirmingReset(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset that sign-in",
      );
    } finally {
      setResetting(null);
    }
  }
```

- [x] **Step 4: Add the `formatLongDate` import**

At the top of `components/admin/GroupList.tsx`, after the `canDeleteGroup` import:

```tsx
import { formatLongDate } from "@/lib/format";
```

The admin already renders dates this way — `components/admin/PageList.tsx:220` uses it for a tile eyebrow ("30 juillet 2026 · Everyone"). An English label beside an `fr-CA` date looks odd written down and is the established precedent; the alternative is a second date formatter for one line.

- [x] **Step 5: Replace the invite-link block**

Replace the whole `{group.chatToken && ( … )}` block (lines 136-182) with:

```tsx
              {group.chatToken && (
                <>
                  {group.email === null ? (
                    <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                      Invitation — share once:{" "}
                      <code className="break-all">
                        /g/{group.slug}?k={group.chatToken}
                      </code>
                    </p>
                  ) : (
                    // No link once claimed: the invite has been spent, and
                    // showing a dead URL is a support call waiting to happen.
                    <p className="mt-1 px-5 text-xs text-[var(--color-ink-muted)]">
                      <span className="break-all">{group.email}</span>
                      {group.claimedAt !== null && (
                        <> · signed up {formatLongDate(group.claimedAt)}</>
                      )}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmingReset(group.id);
                    }}
                    className="mt-1 text-xs text-[var(--color-ink-muted)] underline"
                  >
                    {group.email === null ? "New invite link" : "Reset sign-in"}
                  </button>

                  {confirmingReset === group.id && (
                    <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm">
                      <span>
                        {group.email === null
                          ? `Make a new invite link for ${group.name}? The old one stops working.`
                          : `Reset sign-in for ${group.name}? Their email and password are cleared and their old links stop working. Their pages, chat and boards stay.`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmingReset(null)}
                        disabled={resetting !== null}
                        className="text-[var(--color-ink-muted)] underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReset(group.id)}
                        disabled={resetting !== null}
                        className="font-medium text-[var(--color-accent)] underline disabled:opacity-50"
                      >
                        {resetting === group.id ? "Resetting…" : "Reset"}
                      </button>
                    </div>
                  )}
                </>
              )}
```

After a reset the tile flips to the unclaimed branch and shows the fresh invite link — which matters, because **Jenn has to send it**. Until she does, the student's bookmark offers only a sign-in line with no account behind it, and the uniform-form rule means the page cannot say so.

- [x] **Step 6: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all pass. If typecheck reports `onRegenerate` missing, a call site was left behind — re-run the grep from Task 11 Step 2.

- [x] **Step 7: Commit**

```bash
git add app/admin/page.tsx components/admin/GroupList.tsx
git commit -m "feat: show claim state and reset sign-in in the admin" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 13: Documentation

**Files:**
- Modify: `CLAUDE.md`

`CLAUDE.md` currently describes the token as the whole of student access. Three places state that and are now wrong.

- [x] **Step 1: Update the routes table**

In the `/g/[slug]` row, replace "the card for `?date=` (public); `?tab=files`, `?tab=board` and the chat need the token" with "the card for `?date=` (public); `?tab=files`, `?tab=board` and the chat need the student to be signed in — a valid `chatToken` cookie **and** a claimed account".

- [x] **Step 2: Add a subsection to Auth**

Directly after the existing `### Auth` content about the teacher's single passkey, add:

```markdown
Students sign in with an email address and a password, on `/g/[slug]` itself.
`?k=<chatToken>` is no longer a key: it is a **single-use invitation** that
permits creating the account, and the first sign-in is the sign-up. Claiming
**rotates `chatToken`**, which spends the invitation — without that rotation,
`unlocked` (`holdsToken && claimed`) would admit anyone still holding a
forwarded copy of the same link, with no password. `filesToken` is not rotated
on claim, only on reset.

`studentGate` (`lib/student-gate.ts`) decides which of six states a visitor is
in, and its clause order is the specification — see the comments. Two clauses
exist for Jenn specifically: she must never be shown a sign-up form she could
complete on a student's behalf, and after a claim her stored cookie is stale, so
she is told to reopen the student from the admin rather than shown a student
sign-in form. `unlocked` is derived from the gate and still never consults the
teacher session, which means **she cannot open the chat or a board for a student
who has not signed up yet**. That is deliberate: there is nobody on the other
end. Pages can still be assigned and pinned to that student from the admin.

Passwords are bcrypt, cost 12, through `lib/password-hash.ts` — **the async API
only**, because one pm2 fork process serves every SSE stream and a synchronous
hash would stall the `: ping` heartbeats. The 72-byte cap in
`lib/student-credentials.ts` is not cosmetic: bcrypt silently truncates past it,
and `tests/lib/password-hash.test.ts` pins that behaviour so the cap is not
"cleaned up" later. Sign-in failures are one message that names both fields, an
unclaimed student still costs a hash, and the form renders identically either
way — three halves of one defence against slug enumeration.

`resetStudentSignIn` (`app/actions.ts`) replaces the old
`regenerateStudentLinks`: it clears the credential and rotates both tokens,
because clearing a password without rotating would leave whoever is signed in
still signed in. It obliges Jenn to send the new invite — the student's page
cannot tell them their account was reset without telling a stranger the same
thing.

Nothing here sends email. The address is stored for newsletters and chat alerts
later; "I forgot my password" is Jenn pressing Reset sign-in.
```

- [x] **Step 3: Correct the Lesson chat paragraph**

In `### Lesson chat`, the sentence "`chatToken` unlocks the files tab and the chat on `/g/[slug]`" is now only half true. Replace it with "`chatToken` unlocks the files tab and the chat on `/g/[slug]`, but only once the student has claimed their account — on its own it now only permits *creating* that account (see *Auth*)".

- [x] **Step 4: Verify and commit**

```bash
npm run lint
git add CLAUDE.md
git commit -m "docs: describe student sign-in in CLAUDE.md" \
  --trailer "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 14: Full verification

**Files:** none

- [x] **Step 1: Run the whole CI sequence in CI's order**

```bash
npx prisma generate && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all five pass. This is what `.github/workflows/ci.yml` runs, and per `docs/DEPLOY.md` a red build must not be deployed.

- [x] **Step 2: Seed a student and walk the claim flow by hand**

The actions and components have no unit tests by convention, so this script is their verification. Start the dev server (`npm run dev`) and, in another shell, create a student:

```bash
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
const t=require('crypto').randomBytes(16).toString('hex');
p.group.create({data:{name:'Test Student',slug:'test-student',chatToken:t,filesToken:require('crypto').randomBytes(16).toString('hex')}})
 .then(g=>console.log('http://localhost:3000/g/'+g.slug+'?k='+g.chatToken));
"
```

Walk each of these and confirm the stated result:

| # | Action | Expected |
|---|---|---|
| 1 | Open `/g/test-student` with no cookie, logged out | Card renders. One line: "Vous avez un compte ? Se connecter". No tabs. |
| 2 | Open the `?k=` URL printed above | Redirects to `/g/test-student`; the sign-up form is **open** |
| 3 | Submit with password `court` | "au moins 8 caractères", no round trip |
| 4 | Submit with email `nope` | "Ce courriel ne semble pas valide." |
| 5 | Submit `you@example.com` / `bonjour-québec` | Signed in: Files and Whiteboard tabs appear, chat button appears, "Se déconnecter" shows |
| 6 | Re-open the **original** `?k=` URL in a private window | Sign-**in** form, not sign-up — the invite was spent by the rotation |
| 7 | *Se déconnecter*, then sign in with the same credentials | Signed in again |
| 8 | Sign in with the right email and a wrong password | "Le courriel ou le mot de passe ne correspond pas." |
| 9 | Wrong password ten times | "Trop d'essais…", and the correct password is refused too until fifteen minutes pass or the dev server restarts |
| 10 | Open `/g/all` | Unchanged: public card, public shelf, **no form** |
| 11 | Open `/g/test-student` logged in as the teacher, no `?k=` | The English "out of date" notice — not a student form |
| 12 | From `/admin?tab=groups`, press **Reset sign-in**, confirm | Tile flips to the invite link; the student's browser loses access on refresh |
| 13 | Check the shelf and chat survived the reset | The student's pages and messages are all still there |

- [ ] **Step 3: Confirm the password manager offer** — NOT VERIFIED: needs a
      human at a real browser. The mechanism it checks is in place (both inputs
      inside one `<form>`, `autoComplete="email"` with `new-password` on
      sign-up / `current-password` on sign-in, confirmed in the rendered HTML).

In a real browser (not a private window), complete step 5 above and confirm the browser or password manager offers to save the credentials. If it does not, check that both inputs are inside the one `<form>` and that `autoComplete` is `email` / `new-password` — that pairing is the whole mechanism.

- [x] **Step 4: Confirm no PII reached the logs**

```bash
grep -rn "student-auth" .next/ 2>/dev/null | head
```

Then check the dev server's own output: the claim and reset lines must contain the **slug only**. If an email address appears anywhere in a log line, fix it before committing — that is SEC-DAT-1.00.

- [x] **Step 5: Clean up the test student and commit anything outstanding**

```bash
node -e "
const {PrismaClient}=require('@prisma/client');
new PrismaClient().group.deleteMany({where:{slug:'test-student'}}).then(r=>console.log(r));
"
git status --short
```

Expected: no uncommitted source changes. `dev.db` and `.env` are gitignored.

---

## Notes for the reviewer

Five things in this change look like they could be simplified and cannot. Each has a comment in the code; this is the index.

1. **`claimStudent` rotates `chatToken`.** Remove it and any forwarded copy of a spent invite signs in without a password. `app/student-auth-actions.ts`.
2. **The 72-byte password cap.** bcrypt truncates rather than erroring, so a longer password's prefix is what actually protects the account. `tests/lib/password-hash.test.ts` pins the truncation empirically.
3. **The equal-cost hash when no account exists.** Deleting it turns response time into an oracle for which slugs are claimable. `signInStudent`.
4. **The uniform `"login"` terminal clause.** Showing nothing for an unclaimed student would leak the same thing the form's presence otherwise hides. `lib/student-gate.ts`.
5. **The explicit `select` and the explicit `.map`** in `app/g/[slug]/page.tsx` and `app/admin/page.tsx`. They are the boundary that keeps `passwordHash` out of a client payload. A spread would silently ship it.

And one behaviour change to expect a question about: Jenn can no longer open the chat or whiteboard tab for a student who has not signed up yet. That follows from `unlocked` never consulting the teacher session, which is a documented decision this plan preserves rather than a side effect. It is discussed under *Access* in the spec.
