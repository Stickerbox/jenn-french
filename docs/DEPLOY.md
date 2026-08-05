# Deploying a change

The routine path for getting a code change from your laptop onto
**https://francaisavecjenn.ca**. For anything unusual — restoring the database,
handing over the passkey, rebuilding the box — see `DEPLOYMENT.md`, which is the
full runbook. This document is only the everyday loop.

Nothing here is automatic. Pushing to `main` runs CI; it does **not** deploy.
The server only changes when you run the deploy step yourself.

---

## The whole thing

```bash
# 1. locally
npm run lint && npm run typecheck && npm test && npm run build
git add -A && git commit -m "..." && git push

# 2. wait for CI
gh run watch

# 3. deploy
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161 './deploy.sh'
```

That is the entire flow once `deploy.sh` is installed (below). The rest of this
document explains each part and what to do when one of them fails.

---

## 1. Before you commit

Run the same four checks CI runs, in the same order. They take a couple of
minutes locally and save a round trip through a red build:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If you changed `prisma/schema.prisma`, also make sure the migration is committed:

```bash
npx prisma migrate dev --name <short_name>   # creates prisma/migrations/<...>/
git status                                    # the new migration must be staged
```

A schema change without its migration file will pass CI locally and then fail on
the server, because the server runs `migrate deploy` and never generates
migrations itself.

This release adds the `Page` and `PageGroup` tables this way — an ordinary
`migrate deploy`, no extra step. If the upload endpoint is wanted, `.env.local`
also needs `PAGES_UPLOAD_TOKEN` added by hand before this deploy; see
"Environment variables" in `DEPLOYMENT.md`.

The worksheet-versions release is not this simple. Its migration adds a
non-nullable `worksheet` column with a default, which Prisma cannot do on
SQLite with an `ALTER TABLE` — it rewrites the whole `Page` table (the
`RedefineTables` steps: create `new_Page`, copy every row across, drop the old
table, rename). Rows carry up to 3 MB of PDF each, so for the length of that
copy the table's on-disk footprint roughly doubles, and it is not instant.
`deploy.sh` already runs `~/backup-db.sh` immediately before any migration, so
the routine flow covers this — but if you are ever applying this one by hand
outside the script, take a fresh `VACUUM INTO` backup first rather than
trusting an old one.

## 2. Commit and push

`main` is the deploy branch and CI runs on pushes to it. Push directly for small
changes; open a PR when you want the diff reviewed first.

```bash
git add -A
git commit -m "feat: ..."
git push
```

## 3. Wait for CI

```bash
gh run watch                      # follows the run for the commit you just pushed
gh run list --branch main -L 1    # or just check the last one
```

CI runs `prisma generate` → lint → `tsc --noEmit` → test → build. **Do not deploy
a red build.** The server runs the same `npm run build`, so a build failure in CI
is a build failure on the box — except there it happens after `git pull` has
already moved the working tree, leaving you to fix it under pressure.

## 4. Deploy

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161 './deploy.sh'
```

The script is idempotent and safe to re-run. It exits early if the server is
already on the newest commit.

Expect **1–3 minutes**, most of it `npm run build`. The box is a `t3.small` with
2 GB of RAM and 2 GB of swap; the build is the heaviest thing that ever runs on
it, and it is slow rather than broken.

There is a window of roughly 20–30 seconds between the build starting and pm2
restarting where the running server is reading a `.next` directory that is being
rewritten underneath it. A student loading a page in that window may get a chunk
error and need to refresh. For a class-hours deploy this is worth knowing; it has
not been worth solving.

**Do not switch pm2 to cluster mode.** Chat fan-out is an in-process
`EventEmitter`; with more than one worker a message reaches only the viewers
connected to the same one, and nothing reports the loss. See the chat section
of `CLAUDE.md`.

---

## One-off: re-dating cards to the five-day week

Run **once**, on the deploy that moves the teaching week from Monday–Saturday to
Monday–Friday. `deploy.sh` does not run it; it is a data migration, not a schema
one, so nothing runs it for you.

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
~/backup-db.sh                                              # before anything
npx --yes tsx scripts/reschedule-five-day-week.mjs          # dry run, read it
```

Read the output before going any further — this is deliberately its own step
rather than the middle of a block you'd paste all at once, because pasting the
whole thing would run the migration before you'd read anything. It lists every
card at or after Monday 27 July 2026 with the date it will move to, unchanged
rows included. Check two things:

- the first Saturday listed moves to the Monday after it
- no weekday you expected to see is missing from the list

That second check matters because the script remaps calendar positions, not
the cards themselves: it shifts by the Saturdays *crossed*, not by the
Saturday cards that existed. If Jenn skipped a Saturday, the following Monday
still moves forward and leaves a gap. That's intended behaviour, and the dry
run is the only place to notice it before it's live.

Once the output looks right, apply it:

```bash
npx --yes tsx scripts/reschedule-five-day-week.mjs --apply
pm2 restart jenn-french
```

Order matters: deploy the code **first**, then run the script. Between the two
there are Saturday cards the picker no longer offers, so that one day is
unreachable for a few minutes. The other order is worse — cards would be
re-dated while the picker still showed a Saturday dot pointing at a day that had
just been vacated.

The script reads all the affected rows before it opens its write transaction. If
the site is live while it runs and Jenn saves a card in that window, the
transaction fails and rolls back — safe, but a wasted run. Run it in a quiet
window, or stop the app (`pm2 stop jenn-french`) first if you'd rather not
gamble on the timing.

Re-running is safe. Once no card sits on a Saturday the script prints
`already migrated, nothing to do` and writes nothing. **Rollback for a bad apply
is the backup from step one**, not a reverse run — the mapping only goes
forward.

A card on a Saturday *before* the anchor (Monday 27 July 2026) is out of scope
for the script and is not moved. After this change it also can't be opened
from `/admin` any more — the calendar has no Saturday cell, and
`parseAdminDate` snaps any hand-typed one forward to the following Monday. In
practice the only such date that can exist is Saturday 25 July 2026. Recorded
here so nobody rediscovers it as a bug.

---

## Installing `deploy.sh` (one time)

**Already installed** on the current instance (`54.80.104.161`), as of
2026-07-28. This section is here for rebuilding the box, and as the record of
what the script contains — it lives on the server, not in the repo, so this is
the only copy under version control. Edit it here and re-copy it up if you
change it.

To install it on a fresh box: SSH in, create the file, make it executable.

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
nano ~/deploy.sh     # paste the script below
chmod +x ~/deploy.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/jenn-french

PREVIOUS=$(git rev-parse HEAD)
echo "→ currently at $(git rev-parse --short HEAD)"

git pull --ff-only

if [ "$(git rev-parse HEAD)" = "$PREVIOUS" ]; then
  echo "✓ already up to date — nothing to deploy"
  exit 0
fi

echo "→ deploying $(git rev-parse --short HEAD)"

# npm ci deletes and rebuilds node_modules from scratch, which is minutes on a
# t3.small. Only pay that when the lockfile actually moved.
if ! git diff --quiet "$PREVIOUS" HEAD -- package-lock.json; then
  echo "→ lockfile changed, reinstalling"
  npm ci
fi

# Back up before touching the schema. Applying a migration is the one step here
# that checking out the old commit does not undo.
if ! git diff --quiet "$PREVIOUS" HEAD -- prisma/; then
  echo "→ schema changed, backing up then migrating"
  ~/backup-db.sh
  npx prisma migrate deploy
fi

# Cheap, and the generated client has to match the schema the build compiles
# against — skip it after a schema change and you build against stale types.
npx prisma generate

npm run build
pm2 restart jenn-french

# Don't report success until the site actually answers.
echo "→ waiting for the app"
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null --max-time 5 https://francaisavecjenn.ca; then
    echo "✓ deployed $(git rev-parse --short HEAD) — site responding"
    exit 0
  fi
  sleep 2
done

echo "✗ site did not respond after restart. Check: pm2 logs jenn-french --lines 50"
exit 1
```

What it deliberately does:

- **Skips `npm ci` unless `package-lock.json` moved.** That check is most of the
  difference between a 30-second deploy and a three-minute one.
- **Backs up the database before running a migration**, using the existing
  `~/backup-db.sh` (S3, `VACUUM INTO`). A migration is the only irreversible step.
- **Runs `prisma generate` every time.** It is fast, and the failure mode when
  it's missing — a build compiled against the previous schema's types — is
  confusing enough to be worth never risking.
- **Verifies the site responds before claiming success.** `pm2 restart` returns
  immediately and reports success even when the process then crashes on boot.

---

## Doing it by hand

If the script is not installed, or you want to watch each step:

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french

git pull
npm ci                       # only if package-lock.json changed
~/backup-db.sh               # only if the schema changed
npx prisma migrate deploy    # only if the schema changed
npx prisma generate
npm run build
pm2 restart jenn-french
```

Then check it:

```bash
pm2 list                            # status should be "online", restarts not climbing
pm2 logs jenn-french --lines 50
curl -I https://francaisavecjenn.ca
```

---

## When it goes wrong

**Build fails on the server but passed in CI.** Almost always memory. Check
`free -h` — if swap is being consumed, the build is thrashing rather than broken;
let it finish. If it was killed outright, `pm2 stop jenn-french` frees ~200 MB,
build, then start it again.

**The app won't come back up.** `pm2 logs jenn-french --lines 100`. A missing env
var is the usual cause — `.env` and `.env.local` live on the server only and are
not in git, so a new required variable has to be added there by hand *before* the
deploy that needs it.

**`git pull` fails.** The deploy key is read-only, so this is never a permissions
problem with pushing. If the working tree is dirty (someone edited a file on the
box), `git stash` or `git checkout -- .` and pull again.

**SSH times out.** Your home IP changed. Fix it in the AWS console under EC2 →
Security Groups → inbound → SSH → Source → My IP. Never widen it to `0.0.0.0/0`
— that is the documented cause of both past compromises of this project.

## Rolling back

Code rolls back cleanly; schema changes do not.

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
git log --oneline -5           # find the last good commit
git checkout <sha>
npm ci                         # if the lockfile differs
npx prisma generate
npm run build
pm2 restart jenn-french
```

This leaves the server on a detached HEAD, which is fine and intentional — the
next `deploy.sh` run will fail at `git pull --ff-only` rather than silently
re-deploying the bad commit. Get back on track with `git checkout main` once
`main` has the fix.

**If the bad deploy included a migration**, checking out the old code does not
un-apply it. Depending on the migration, the old code may run fine against the
new schema (added a nullable column) or may not (renamed or dropped one). If it
doesn't, restore the database from the backup `deploy.sh` took immediately before
migrating — the procedure is under "Restoring the database from a backup" in
`DEPLOYMENT.md`.
