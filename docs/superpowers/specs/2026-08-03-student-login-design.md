# Student sign-in — design

2026-08-03

## Problem

A student's access to their private surfaces — the Files shelf, the whiteboard
tab, the chat — rests entirely on holding a link. `/g/marie?k=<chatToken>` is
the credential, and it is permanent, bearer, and forwardable. That was a
deliberate choice and it has served, but it has three costs that have now come
due:

1. **Jenn has no email addresses.** There is no way to send a newsletter, and no
   way to tell a student that a message is waiting. The chat spec left "email on
   a message Jenn missed" as future work; there is nothing to send it *to*.
2. **The secret cannot be replaced by the student.** A link forwarded to a
   sibling, pasted into a group chat, or left in a shared browser's history is
   permanently valid until Jenn notices and regenerates it.
3. **It is not what anyone expects.** A student who loses the link has no way
   back in on their own, and no password manager helps them, because there is
   nothing for a manager to hold.

## Goal

A student opens their link, enters an email address and a password, and is in.
The first time they do it, that *is* the sign-up — same form, same fields, no
separate flow to explain. Thereafter their plain bookmark plus their password
manager gets them back in on any device. Jenn ends up holding an email address
per student, which is the enabling step for newsletters and chat alerts later.
From the admin she can reset a student's sign-in without touching a single card,
page, pin, message or board.

## What this retires

The 2026-07-31 lesson chat design has, under *Rejected*:

> **A PIN, or any student login.** Rejected in favour of the link being the
> secret. It is one more thing for a student to lose, and the material behind it
> is homework, not banking.

That was correct when it was written and is now retired. The reasoning has not
been refuted — the material really is homework — but the decision was made
before an email address was something the project wanted, and an email address
is not something the token model can ever produce. The "one more thing to lose"
objection is answered by the password manager the form is now explicitly shaped
for, and by Jenn's reset.

What survives from that spec, and must keep surviving:

- **The daily card stays public.** An untokened visit to `/g/marie` renders
  exactly what it renders today. This is still the load-bearing decision: every
  existing bookmark keeps working, a forwarded plain link leaks nothing, and
  there is no login wall in front of the site's first purpose.
- **A wrong token is a 404, never a 403.**
- **The everyone group has no private surface at all** and therefore has nothing
  to sign in to.

## Scope

In:

- `email`, `passwordHash`, `claimedAt` on `Group`.
- A one-time **invite**: `?k=<chatToken>` stops unlocking anything by itself and
  becomes permission to create the account.
- Sign-up and sign-in as one form, on `/g/[slug]`, under the public card.
- Sign-out.
- **Reset sign-in** in the admin Students tab, replacing today's "Make new
  links".
- Throttling, and the enumeration and timing defences that go with a login form.

Out, and deliberately so — none of this is missing, it is not being built:

- **Sending email of any kind.** No newsletter, no chat alert, no
  forgot-password mail, no verification. There is no provider, no SMTP config
  and no sending code in this project. The `email` column is the enabling step;
  delivery is its own build with its own spec. "I forgot my password" is Jenn
  pressing Reset sign-in.
- **Email verification.** Nothing sends mail, so nothing can verify an address.
  A typo is corrected by a reset.
- **Student-initiated password change.** Reset covers the case that matters.
- **Per-IP throttling.** See *Throttling*.
- **An emails export.** When the newsletter is built it is one query.
- Multiple accounts per student, parent accounts, or any second participant in a
  conversation the schema states has exactly two.

## Architecture

The credential lives on `Group`, and a successful sign-in sets **the cookie that
already exists** — `student-token-<slug>`, to `group.chatToken`, exactly as
`middleware.ts` sets it today for `?k=`.

The consequence is the reason this shape was chosen: **not one authorisation
check changes.** `chatRole`, `shelfRole`, `POST /api/chat/[slug]`, the SSE
stream and all five whiteboard routes keep asking the single question they ask
now — does the presented token equal `group.chatToken`? `chatRole`'s own comment
warns why that matters: "a rule duplicated across two files is a rule that will
eventually differ in one of them, and the difference would be a hole rather than
a bug report." Eight authorisation sites learning a second way to say yes is
sixteen paths to keep true. This design adds none.

What changes is not *who* the cookie admits but *how it is obtained*. Today the
token is a URL the student keeps. After this, it is handed out once as an
invitation and thereafter placed in the cookie jar by the server after a
password check. Same value; a different exposure profile. It stops being a link
that can be forwarded and becomes a session artefact.

Rejected alternatives are recorded at the end.

## Schema

```prisma
model Group {
  // ...existing...

  // Null until the student claims their invite. Stored trimmed and lowercased,
  // because it is an identifier we compare on sign-in and will one day mail.
  //
  // Deliberately NOT @unique: sign-in is scoped to the slug in the URL, so
  // uniqueness buys nothing, and two siblings taught by Jenn share one parent's
  // inbox. A unique index would make the second sign-up fail with nothing but a
  // constraint error to explain it.
  email        String?
  // bcrypt, cost 12. The salt is inside the string — the bcrypt format carries
  // it, so there is no second column.
  passwordHash String?
  // Displayed in the admin, and an audit fact: a claim at an hour Jenn does not
  // recognise is the signal that an invite leaked.
  claimedAt    DateTime?
}
```

One migration, `add_student_credentials`. No backfill: existing rows come out
`null` on all three, which reads as *unclaimed but holding a valid token* — and
that is exactly the migration behaviour wanted. Every student already using the
site has a cookie carrying a valid `chatToken`, so on their next visit that
cookie **is** their invite and they are shown the sign-up form. Jenn re-shares
nothing, their content is untouched, and their email arrives without anyone
having to chase it.

## Access

### The gate

One pure function, `lib/student-gate.ts`, a sibling of `chatRole`
(`lib/chat-access.ts`) and `shelfRole` (`lib/shelf-access.ts`). It returns a
string rather than a bag of booleans, for the reason those two do: the page gets
one `switch`, and the test file enumerates the entire state space including the
combinations that should not be reachable.

```ts
export type StudentGate =
  | "none"          // nothing to sign in to
  | "signed-in"     // the old `unlocked`
  | "unclaimed"     // teacher, student has not signed up yet
  | "teacher-stale" // teacher, claimed, her token is out of date
  | "signup"        // holds a live invite, no account yet
  | "login";        // everyone else
```

Evaluated in this order, and the order is the specification:

1. `isEveryone || chatToken === null` → `"none"`. The everyone group is refused
   first, as it is in `chatRole`, so that no later clause can admit it by
   accident. `/g/all` renders exactly as it does today: public card, public
   shelf, no form.
2. `holdsToken && claimed` → `"signed-in"`.
3. `isTeacher && !claimed` → `"unclaimed"`.
4. `isTeacher && claimed` → `"teacher-stale"`.
5. `holdsToken && !claimed` → `"signup"`.
6. otherwise → `"login"`.

`holdsToken` is `chatToken !== null && presented === chatToken`, and `claimed` is
`passwordHash !== null`. Both halves of `holdsToken` must be present for the
reason `chatRole` gives: a group with no token must not be enterable by
presenting the string `"null"`.

`app/g/[slug]/page.tsx` stops computing `unlocked` by hand and derives it —
`const unlocked = gate === "signed-in"` — so the panel and the tabs cannot
disagree about who is signed in.

**Clause 6 is a security requirement, not a fallback.** The sign-in form renders
identically whether or not that student has an account. If an unclaimed student
showed no form, the *presence of the form* would tell a slug-guesser which
students exist and which are claimable.

**Clause 3 exists because the teacher must not be able to claim a student's
account.** She opens student pages from the admin with `?k=` in the URL, so
without this clause she would be handed the sign-up form and could complete it.
She sees a notice and the invite link to share instead.

**Clause 4 exists because a claim rotates the token** (below), which makes Jenn's
stored cookie for that slug stale the moment a student signs up. Without this
clause she would land on her own student's page and be shown a *student sign-in
form*, which invites precisely the wrong action. She gets one English line
telling her to open the student from the admin, where the link always carries the
current token.

### Why `unlocked` does not consult the teacher session

`app/g/[slug]/page.tsx` says today, and continues to say, that `unlocked` checks
only the token and never the teacher session: "A teacher who opens a student's
page without that token sees no chat, same as anyone else." That is preserved,
and it has a consequence worth stating plainly so it is not later filed as a
bug: **Jenn cannot open the chat or the whiteboard tab for a student who has not
signed up yet.** There is nobody on the other end of a conversation nobody has
claimed. She can still assign and pin pages to that student from the admin Pages
tab, which is where that workflow already lives.

### Routes

No new routes. `/f/[token]` is untouched — still read-only, still no sign-in,
because `filesToken` addresses a shelf and nothing else.

| Route | Before | After |
|---|---|---|
| `/g/marie` | public card; tabs and chat if the cookie matches | public card; tabs and chat if the cookie matches **and the account is claimed**; otherwise a sign-in line |
| `/g/marie?k=…` | sets the cookie, unlocks everything | sets the cookie, and offers the sign-up form once |
| `/g/all` | public card and shelf | unchanged |
| `/f/<filesToken>` | that student's shelf, read-only | unchanged — though a reset rotates that token too, exactly as "Make new links" does today |

## Flows

### Claim — the first sign-in is the sign-up

Jenn creates a student and shares `/g/jordan?k=<chatToken>`, which is exactly
what `components/admin/GroupList.tsx` already renders for her to copy.
`middleware.ts` moves the token into the cookie and redirects, unchanged. The
page evaluates the gate to `"signup"` and renders the form open, under the
public card.

The server action re-reads the token from the cookie itself and compares it to
`group.chatToken`. It does **not** trust a hidden form field: hiding a control is
not a guard, the same principle `deleteGroup` states when it re-checks
`canDeleteGroup` server-side.

The write is a conditional update, not a transaction:

```ts
const { count } = await prisma.group.updateMany({
  where: { id: group.id, passwordHash: null },
  data: { email, passwordHash, claimedAt: new Date(), chatToken: freshToken },
});
if (count !== 1) throw /* already claimed */;
```

Two submissions racing both read "unclaimed"; the loser updates zero rows and is
told the link has already been used.

### The claim rotates `chatToken`, and this is load-bearing

Not tidiness — omitting it is a hole. `unlocked` becomes `holdsToken && claimed`.
The moment Jordan claims his account, `claimed` is true for *everyone*, so anyone
still holding a forwarded copy of that same invite link satisfies both halves and
is admitted **without a password**. Rotating the token on claim spends the
invitation and makes every other copy inert. The new value is written into the
claimant's cookie in the same response, so they stay signed in across the
redirect.

`filesToken` is **not** rotated on claim. It has no UI surface today, it
addresses only the read-only shelf, and a files link Jenn dug out of the database
and sent to a parent should not die because the student signed up. Reset
sign-in *does* rotate both — see below.

### Sign-in

Gate is `"login"`. The action:

1. Checks the throttle for this slug; if locked, returns the too-many-tries
   message without hashing anything.
2. Loads the group by slug. A missing group, or the everyone group, fails
   generically — the page itself is still `notFound()` for a bad slug, so this is
   only reachable by a direct action call.
3. Normalises the submitted email and compares it to the stored one, and runs
   `bcrypt.compare` against the stored hash.
4. **If there is no stored hash, it still runs a comparison against a fixed
   dummy hash**, so an unclaimed student and a wrong password take the same time.
5. On any failure: records the attempt and returns one message. On success:
   clears the throttle, sets `student-token-<slug>` to `group.chatToken`
   (`httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, one
   year — identical to what middleware sets), and revalidates `/g/<slug>`.

Both the email and the password must match. Sign-in is already scoped to the
slug in the URL, so the password alone would technically identify the student —
requiring the email too is what makes this a login rather than a shared PIN, and
it is what password managers are shaped to fill.

`path: "/"` is deliberate and inherited: a cookie scoped to `/g/<slug>` would
never be sent to `/api/chat/<slug>`. The per-student *name* is what separates
students, not the path.

### Sign-out

Deletes that one cookie and revalidates. Present whenever the gate is
`"signed-in"` — the shared family laptop is the case, and it is one line of code.
It does not rotate anything: signing out is not revocation.

### Reset sign-in

One control in the admin, absorbing today's "Make new links" rather than sitting
beside it, because after this change they are the same operation. In one update
it clears `email`, `passwordHash` and `claimedAt`, and mints a fresh `chatToken`
**and** `filesToken`.

Rotating the token is what makes the reset a revocation: any browser currently
signed in holds the old token in its cookie, and that cookie stops matching
immediately. This is what evicts a stranger who claimed an invite that leaked.
`filesToken` is rotated here, unlike on claim, because this action inherits
"Make new links" and must keep that button's revoke-everything meaning.

It must also keep that action's `chatBus.publishRevoke(groupId)` call, and for
the reason `app/actions.ts` already gives: a token is checked when a stream
connects, so without it a tab left open on the old token keeps receiving
messages until that connection happens to drop. The **claim** path needs no
equivalent, and the reason is worth a comment rather than an assumption — before
a claim nobody is signed in, because `unlocked` now requires `claimed`, so there
is no open stream on that group to revoke.

Nothing else is touched: cards, pages, `PageGroup` rows, pins, messages,
whiteboards and `teacherLastReadAt` all stay. The student signs up again, with
whatever email they like, and finds everything where they left it.

Jenn never sees, types, or transmits a password.

**A reset obliges her to send the fresh invite link.** Until she does, the
student's bookmark shows only the sign-in line, and there is no account behind it
to sign in to — by design, since a form that announced "this account has been
reset" would announce it to a stranger too. The confirm dialog therefore hands
her the new link immediately afterwards rather than making her go looking for it.

## Screens

### Student — `/g/[slug]`

One new client component, `components/student/StudentAuthPanel.tsx`, rendered
under the tabs row and above the card. It switches on the gate value, so the
panel and the gate cannot drift.

**Sign-up expands; sign-in collapses.** A student arriving on an invite came to
do exactly one thing, so `"signup"` renders the form open. `"login"` renders a
single line — *Vous avez un compte ? Se connecter* — that expands on click. The
public untokened view therefore gains one line of chrome and nothing more, which
keeps "a forwarded plain link is a card and nothing else" true in feel as well as
in access.

| gate | renders | language |
|---|---|---|
| `"none"` | nothing | — |
| `"signup"` | open form, *Créer mon compte* | French |
| `"login"` | collapsed line, expanding to the same fields | French |
| `"signed-in"` | *Se déconnecter* | French |
| `"unclaimed"` | "Marie hasn't signed up yet" + the invite link to share | English |
| `"teacher-stale"` | "Your link for Marie is out of date — open her from the admin" | English |

Student copy is French and teacher copy is English, following the split the
codebase already keeps (`AddLinkRow.tsx` is French; `GroupList.tsx` is English).
Labels: **Courriel**, **Mot de passe**. Failure: *Le courriel ou le mot de passe
ne correspond pas.* Throttled: *Trop d'essais. Réessayez plus tard ou écrivez à
Jenn.* Errors render `role="alert"` in `--card-rouge`, and the fields reuse
`fieldClassName` from `components/ui/field.ts`, as the shelf's add-link row does.

**Both fields live in one `<form>` and are submitted together**, with
`autoComplete="email"` and `autoComplete="new-password"` on sign-up /
`"current-password"` on sign-in, `type="email"` and `type="password"`. That is
the whole of "make password managers pick it up": a manager keys off an
identifier field and a password field in the same submission. A two-step "email,
then password" wizard looks tidier and is the most common way to break saving —
it is therefore ruled out here, not left to taste. A show/hide toggle on the
password field is included; these are students, sometimes children, typing on
phones.

### Admin — Students tab

`GroupSummary` gains `email: string | null` and `claimedAt: Date | null`, and
`app/admin/page.tsx` selects them. The block under each tile becomes
claim-state-dependent:

- **Unclaimed** — the invite link as it renders today, labelled as an invitation
  to share once, and the button reads **"New invite link"**. Still wanted: it
  revokes an invite that leaked before it was used.
- **Claimed** — `marie@example.com · signed up 2 août 2026`, and **no link**.
  English label, `fr-CA` date: the date goes through `formatLongDate` from
  `lib/format.ts`, which is exactly what `components/admin/PageList.tsx` already
  does for a tile eyebrow ("30 juillet 2026 · Everyone"). The mixture looks odd
  written down and is the established precedent — the admin gets one date
  format, UTC like every date here, rather than a second formatter for one line.
  The
  invite is spent; displaying a dead URL is a support call waiting to happen. The
  button reads **"Reset sign-in"**.

Both labels fire the same action. Confirm copy, which has to carry the
reassurance because "reset" does not imply it to a non-technical reader:

> Reset sign-in for Marie? Their email and password are cleared and their old
> links stop working. Their pages, chat and boards stay.

Copy about a *student* stays gender-neutral throughout — Jenn's students are not
all of one gender and the schema records a name, not a pronoun. Copy about Jenn
herself keeps the "she" the rest of this project's documentation uses.

After it runs the tile flips to unclaimed and shows the fresh invite link ready
to copy. The tile's `href` keeps its `?k=` in both states — that is how Jenn
unlocks a claimed student, and it always carries the current token, which is what
makes `"teacher-stale"` a one-click fix.

## Passwords and hashing

`lib/student-credentials.ts`, pure, returning **reason codes** —
`"too-short" | "too-long" | "bad-email"` — rather than sentences. The lib holds
the rule and the copy lives where the language is known, the same split
`lib/page-section-labels.ts` makes for section headings.

- **Minimum 8 characters. No composition rules** — no forced digit, no forced
  symbol. That is NIST 800-63B's position and the right one for a tutor's
  students.
- **Maximum 72 bytes**, measured with `Buffer.byteLength`, not `.length`.
  bcrypt silently truncates past 72 bytes, so two different long passwords
  sharing a 72-byte prefix would both verify. Bytes rather than characters
  matters specifically here: this is a French site, "é" is two bytes in UTF-8,
  and a 40-character accented passphrase is already over the limit. A `.length`
  check would pass it through to be truncated.
- **Passwords are not trimmed.** Trimming silently changes what someone typed,
  and their manager's saved value would then not match. The email *is* trimmed
  and lowercased, because it is an identifier rather than a secret.
- Email shape is checked loosely — one `@`, a dot in the domain, 254 characters
  maximum. Deliberately loose: the only authority on whether an address works is
  sending to it, and this build does not send.

`lib/password-hash.ts` wraps bcryptjs.

- **Cost 12.**
- **The async API only.** `hashSync`/`compareSync` would be a real bug here, not
  a style preference: one pm2 fork process serves every SSE stream, and a
  several-hundred-millisecond synchronous hash stalls the `: ping` comments that
  keep those streams inside nginx's 60-second `proxy_read_timeout`.
- **The cost factor is a parameter defaulting to 12**, so tests run at 4. A
  cost-12 hash is roughly 300 ms and a test file wants several. This is the same
  injection `lib/whiteboard-hit.ts` uses for its text measurer, for the same
  reason: keep the module pure enough to test cheaply.

bcryptjs, not a native module, is chosen because `npm ci` runs **on the server** —
a `t3.small` with 2 GB of RAM and 2 GB of swap where, per `docs/DEPLOY.md`, "the
build is the heaviest thing that ever runs". A native hash needs a prebuilt
binary matching that box's architecture and libc or it falls back to compiling
with node-gyp, which is exactly the swap-thrashing failure that document warns
about. A pure-JS hash has no build step and nothing to match. bcrypt is also
named explicitly by the organisation's SEC-CRY-1.00 control, so it needs no
documented exception the way Node's built-in `scrypt` would.

Install the current major and check whether it ships its own TypeScript types
before adding `@types/bcryptjs`; recent versions do.

## Throttling

`lib/login-throttle.ts`: pure state transitions (`recordFailure`, `isLocked`,
`clear`) with the map held on `globalThis`, exactly as `lib/chat-bus.ts` and
`lib/whiteboard-live.ts` hold theirs. Ten failures for one slug inside fifteen
minutes locks that slug for fifteen minutes. A success clears the counter.

**It inherits the single-process constraint.** This is only correct because pm2
runs the app in fork mode as one process; under cluster mode the limit silently
becomes per-worker, i.e. as many times looser as there are workers. That is the
same trap already documented for the chat bus and the live whiteboard, and it is
recorded here rather than assumed.

Keyed by slug, not by IP. The attack is against one student, and an IP behind
nginx means trusting `X-Forwarded-For`, which is a header a client sets.

The accepted cost of keying by slug is that someone who knows a slug can lock
that student out on purpose. It is bounded — fifteen minutes, self-healing, no
action needed from Jenn — and the alternative is trusting a client-set header,
which would let the same person bypass the limit entirely by varying it. A
fifteen-minute nuisance is the better failure.

**The claim path is throttled by the same limiter**, for a different reason:
hashing is expensive on purpose, so an unthrottled endpoint that hashes attacker
input is a CPU-exhaustion vector against a two-core box.

## Enumeration, timing, and errors

Three defences that only work together:

1. The sign-in form renders identically whether or not the student is claimed
   (gate clause 6), so its presence reveals nothing.
2. A missing hash still runs a comparison against a fixed dummy hash, so failing
   fast does not reveal an unclaimed student either.
3. Every failure — wrong email, wrong password, unclaimed student — yields the
   one message. Never which half was wrong.

A nonexistent slug remains `notFound()`, preserving the 404-never-403 convention
the chat spec established so a crawler cannot tell a real student's link from a
made-up one.

The dummy hash is a bcrypt hash of a throwaway random string, and is commented as
such so a secret scanner hitting it is not a mystery.

Student-facing failures are one French sentence, following the pattern
`AddLinkRow.tsx` documents: "the action's own messages are English and written
for Jenn; the student gets one French sentence instead of a leaked internal
string." Validation failures are the exception and are specific, because
"at least 8 characters" is not sensitive and a student cannot fix a generic
error.

## Logging and control mapping

The email is PII. **It is never logged** — not in an error, not in a success
line. The admin UI is the one place it is legitimately visible. Claim, reset and
throttle-trip events log the slug and a timestamp through `console.info` with a
stable prefix; this project has no logger and inventing one is not in scope.

| Control | How this design satisfies it |
|---|---|
| SEC-CRY-1.00 | bcrypt, cost 12, per-hash salt carried in the format |
| SEC-ACC-1.00 | deny by default — the gate's terminal clause grants nothing; every mutating action re-checks server-side |
| SEC-SEC-1.00 | no credential in source; the dummy hash is a hash of a throwaway value, commented |
| SEC-DAT-1.00 | email never logged; password never stored, never logged, never returned |
| SEC-ERR-1.00 | one generic failure message; no internal string reaches the student |
| SEC-INJ-1.00 | Prisma parameterises every query; no string-built SQL exists in this project |
| SEC-DEF-1.00 | cookie `httpOnly`, `secure` in production, `sameSite: "lax"` |
| SEC-DEV-1.00 | no `eval`, no dynamic execution, no deserialisation of untrusted input |
| SEC-LOG-1.00 | claim, reset and lockout logged with slug and timestamp |
| SEC-DOC-1.00 | the counter-intuitive rules — token rotation on claim, the 72-byte cap, async-only hashing, the single-process throttle — carry comments explaining the failure each prevents |

## Build order

1. Migration, `lib/student-gate.ts`, `lib/student-credentials.ts`,
   `lib/login-throttle.ts`, `lib/password-hash.ts`, and their tests. No UI yet;
   the whole rule set is verifiable before anything renders.
2. The server actions: claim, sign-in, sign-out, reset.
3. `StudentAuthPanel` and the `app/g/[slug]/page.tsx` rewiring from `unlocked`
   to the gate.
4. Admin: `GroupSummary` fields, claim-state block, the reset control replacing
   "Make new links".
5. Docs.

## Testing

Following the convention that pure modules in `lib/` get tests and components and
Prisma access do not:

| File | Covers |
|---|---|
| `tests/lib/student-gate.test.ts` | all six outcomes; the everyone group refused first; teacher × claimed/unclaimed; token-without-claim; claim-without-token; the `"null"`-string case both `chatRole` and `shelfRole` guard |
| `tests/lib/student-credentials.test.ts` | email trimming, lowercasing, shape rejection, 254-character cap; password reason codes; the 72-byte boundary proved with accented characters |
| `tests/lib/login-throttle.test.ts` | trips at ten; stays locked inside the window; recovers after it; cleared by a success |
| `tests/lib/password-hash.test.ts` | round-trip at injected cost 4; wrong password fails; an over-length password is rejected rather than truncated into a false match |

CI order is unchanged: `prisma generate` → lint → `tsc --noEmit` → test → build.

## Migration and deploy

`npx prisma migrate dev --name add_student_credentials`. No backfill; no data
migration. Every existing student becomes "unclaimed, holding a valid token" and
is offered the sign-up form on their next visit.

`package-lock.json` moves, so the next deploy takes the slow `npm ci` path once —
`deploy.sh` already conditions on that file changing. **No new environment
variable**: bcryptjs needs no configuration.

Docs to update in step 5:

- `CLAUDE.md` — the Auth section gains student sign-in; the `/g/[slug]` row of
  the routes table changes; the Lesson chat paragraph currently says `chatToken`
  "unlocks the files tab and the chat on `/g/[slug]`", which is now true only
  once the account is claimed.
- This spec is the record that the chat spec's *Rejected* entry is retired. That
  file is not edited; specs are dated documents and are left as written.

## Future

- **Newsletter and chat alerts**, the reason the email column exists. Alerts
  belong on the same write path as the SSE publish, gated on Jenn not having an
  open stream for that group — as the chat spec already worked out.
- **Email verification**, which becomes possible and worthwhile the first time
  something is actually sent.
- **Student-initiated password change**, once there is a reason to expect a
  student to want one.

## Rejected

**A separate `StudentAccount` model with its own signed session cookie.** The
conventional shape, and it moves the credential off a table called `Group`. It
also teaches eight route handlers a second way to authorise a student, in a
codebase whose security posture rests on there being exactly one. Sixteen paths
to keep true, for nothing the student can see.

**A `StudentSession` table with opaque session ids.** Individually revocable
sessions with no shared bearer value — the right answer for an app with many
users and real stakes. Here it buys per-device revocation for a two-person
conversation about homework, and costs a table, an expiry and cleanup story, and
the same eight-route change.

**Keeping the plain link as the entry point, with first-come sign-up.** What was
originally asked for, and rejected on one fact: `studentSlug` derives slugs from
first names, so `/g/marie` and `/g/jordan` are guessable, and a newly created
student sits unclaimed until they get round to signing up. First-come sign-up
would let a name-guesser take any unclaimed student's shelf, chat and boards.
Making the existing `?k=` link a single-use invitation costs Jenn nothing — it is
already the link the admin gives her to copy — and closes that entirely.

**Jenn pre-filling the expected email address.** Would let the plain link stay
the entry point while still resisting squatting, but it presumes she already
holds the address, which is the thing this build exists to collect.

**Jenn typing a temporary password for a student.** The fastest recovery inside a
live lesson, and rejected: it puts a plaintext password on her screen, requires
her to read it out over some channel, and makes her a holder of student
credentials. Unclaiming and re-inviting reaches the same place without any of
that.

**Node's built-in `crypto.scrypt`.** Zero dependencies, which suits a repo that
counts them, and its async form runs on the libuv threadpool so it is genuinely
off the event loop — arguably a better fit than pure-JS bcrypt. Rejected because
SEC-CRY-1.00 names Argon2 and bcrypt specifically, and shipping a documented
exception to a security control to avoid one small pure-JS dependency is the
wrong trade.

**A native Argon2 binding.** The strongest hash and properly off-thread.
Rejected on deployment risk: `npm ci` runs on a 2 GB `t3.small`, and a native
module there is either a prebuilt binary that must match the box or a node-gyp
compile that thrashes swap.

**Making the login a wall in front of the whole page.** Would put a form in front
of the daily card, break the shape of the public `/g/all` shelf, and turn every
forwarded link into a login box. The card being public is the oldest load-bearing
decision in this project's access design.
