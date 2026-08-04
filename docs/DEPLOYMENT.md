# jenn-french — Deployment Runbook

Live at **https://francaisavecjenn.ca**

This is the working record of the production deployment, written as it was
done on 2026-07-27. It follows `../Winery/WEBSITE_TEMPLATE.md` but deviates
in several places; every deviation is recorded at the bottom under
"Differences from WEBSITE_TEMPLATE.md" — read that section before reusing
the template for anything else.

---

## Facts

| Thing | Value |
|---|---|
| Domain | `francaisavecjenn.ca` (Namecheap, BasicDNS, apex A record only, no `www`) |
| Elastic IP | `54.80.104.161` |
| Instance | `i-0690b7c00141ae277`, `t3.small`, `us-east-1` |
| OS | Ubuntu 26.04 LTS (Resolute Raccoon) |
| Disk | 20 GiB gp3 |
| Swap | 2 GiB at `/swapfile`, in `/etc/fstab` |
| SSH | `ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161` |
| Repo | `github.com/Stickerbox/jenn-french` — **private** |
| Deploy key | id `158475381`, read-only, title `jenn-french-ec2` |
| App directory | `~/jenn-french` |
| pm2 process | `jenn-french` |
| Node / npm / pm2 | v22.23.1 / 10.9.8 / 7.0.3 |
| SSL | Let's Encrypt, expires 2026-10-25, auto-renew verified |
| S3 backup bucket | `francaisavecjenn-db-backup` (us-east-1, versioning on) |
| IAM role | `jenn-french-ec2-role` with policy `jenn-french-backup-write` |

---

## Status

Done:

- [x] Work merged to `main`, CI green
- [x] Private GitHub repo, read-only deploy key on the server
- [x] Domain bought, A record → Elastic IP
- [x] EC2 instance, security group SSH-restricted to your IP
- [x] Swap, Node 22, pm2, app cloned, env vars set
- [x] Prisma migrations applied, production build, pm2 running and boot-persistent
- [x] nginx reverse proxy
- [x] SSL via certbot, HTTP→HTTPS redirect, renewal dry-run passed
- [x] Hardening: ufw, fail2ban, root login disabled, unattended-upgrades
- [x] Teacher passkey registered (currently **yours**, to be handed to Jenn)
- [x] S3 bucket created

- [x] IAM policy + role attached; instance role verified from metadata
- [x] aws CLI + sqlite3 installed, `~/backup-db.sh` written
- [x] Two backups uploaded successfully; nightly cron installed (03:15 UTC)

- [x] Backup objects confirmed present in S3
- [x] Landing page, card-page header, group delete shipped
- [x] Card generation verified working end to end on `claude-sonnet-5`

Remaining:

- [ ] S3 lifecycle rule to expire old backups (suggest 90 days)
- [ ] Rehearse a restore once, deliberately, before you need it
- [ ] Hand the passkey over to Jenn (procedure below)

---

## Step ⑩ point 2 — IAM role (DO THIS NEXT)

### Part A — Fix the policy (it already exists with the wrong bucket ARN)

The policy was first created against `francaisavecjenn-db-backups`
(plural). The real bucket is `francaisavecjenn-db-backup` (singular), so
the ARN must be corrected or every upload fails with `AccessDenied`.

**AWS Console → IAM → Policies → search `jenn-french-backup-write` → click
it → Permissions tab → Edit → JSON.** Replace everything with:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::francaisavecjenn-db-backup/*"
    }
  ]
}
```

Click through to the review page. **Policy name:** `jenn-french-backup-write`

Note what is deliberately missing: no `GetObject`, no `DeleteObject`, no
`ListBucket`. The server can write backups and do nothing else with them.
A compromised instance cannot read your backup history or destroy it. Given
this project's history — the API key was scraped from a compromised EC2
instance twice — that property is the entire point of doing it this way.

### Part B — Create the role

**IAM → Roles → Create role**

- Trusted entity type: **AWS service**
- Use case: **EC2**
- Next → search for and tick **`jenn-french-backup-write`**
- Next → **Role name:** `jenn-french-ec2-role`
- Create role

### Part C — Attach it to the instance

**EC2 → Instances → select `i-0690b7c00141ae277` → Actions → Security →
Modify IAM role**

- Choose `jenn-french-ec2-role`
- **Update IAM role**

No credentials are written to the server. The instance fetches short-lived,
auto-rotating ones from the metadata service. This is why it is better than
an access key in a file.

**Then tell Claude "next" and it will verify the instance can see the role
before building anything on top of it.**

---

## Step ⑩ point 3 — Backup script and cron

Claude will run this once the role is attached. Recorded here so the
mechanism is not a black box.

Install the AWS CLI on the server:

```bash
sudo apt-get install -y unzip
curl -sS "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
```

The backup script at `~/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DB=/home/ubuntu/jenn-french/prisma/dev.db
BUCKET=francaisavecjenn-db-backup
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# VACUUM INTO takes a consistent snapshot of a live database. A plain cp can
# catch a half-written page and produce a backup that only fails when you
# try to restore it.
sqlite3 "$DB" "VACUUM INTO '$TMP/dev.db';"
gzip -9 "$TMP/dev.db"

aws s3 cp "$TMP/dev.db.gz" "s3://$BUCKET/dev.db-$STAMP.gz" --only-show-errors
echo "backed up dev.db-$STAMP.gz"
```

`sqlite3` is not installed by default on this box; the script needs
`sudo apt-get install -y sqlite3`.

Cron entry (03:15 UTC nightly), installed with `crontab -e`:

```
15 3 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backup.log 2>&1
```

---

## Step ⑩ point 4 — Verify

```bash
~/backup-db.sh          # run it by hand once
```

Then check the object exists in the S3 console. Do not trust a backup you
have never seen arrive.

Afterwards, add a lifecycle rule on the bucket to expire objects after
(say) 90 days, so it does not grow forever.

---

## Operational procedures

### Environment variables

`.env.local` on the server is gitignored and not covered by `deploy.sh` — a new
required variable has to be added there by hand before the deploy that needs
it (see "The app won't come back up" in `DEPLOY.md`). It currently holds
`RP_ID`, `ORIGIN`, and `ANTHROPIC_API_KEY`, described in `CLAUDE.md`, plus:

`PAGES_UPLOAD_TOKEN` — bearer token for `POST /api/pages`. Generate with
`openssl rand -hex 32`. Leaving it unset disables the endpoint entirely (it
returns 404), which is the right setting anywhere Jenn is not publishing from.
Rotating it is just editing `.env.local` and restarting pm2.

### Handing the passkey to Jenn

The app allows exactly **one** passkey. `register-begin` returns
`400 "A passkey is already registered"` once one exists, and there is no UI
to add a second or to remove one. To transfer the account:

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
cd ~/jenn-french
echo "DELETE FROM Passkey;" | npx prisma db execute --schema prisma/schema.prisma --stdin
```

The `Teacher` row survives; only the passkey is removed, which re-opens
registration. Then Jenn visits https://francaisavecjenn.ca/login and
registers.

**Then log out in your own browser.** Deleting the passkey does not
invalidate your session — it is a 7-day cookie holding the teacher id, and
the teacher row still exists. Skip this and you remain silently logged in
as her account for a week.

Tell Jenn to use an iCloud- or Google-synced passkey rather than a
device-bound one. It follows her across devices, so a lost phone is not a
lockout.

### Restoring the database from a backup

The instance role can only `PutObject` — it deliberately cannot read or
delete backups. So a restore is driven from **your** machine and the S3
console, not from the server.

1. **S3 console** → `francaisavecjenn-db-backup` → pick the object → Download.
2. Decompress and copy it up:

   ```bash
   gunzip dev.db-<STAMP>.gz
   scp -i ~/.ssh/jenn-french.pem dev.db-<STAMP> ubuntu@54.80.104.161:/tmp/restore.db
   ```

3. On the server, swap it in — keeping the current file, which is often
   still wanted once the panic passes:

   ```bash
   ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161
   cd ~/jenn-french
   pm2 stop jenn-french
   cp prisma/dev.db prisma/dev.db.before-restore
   cp /tmp/restore.db prisma/dev.db
   pm2 start jenn-french
   ```

4. Check the site, then delete `/tmp/restore.db`.

Stop the app before swapping the file. Replacing a SQLite database under a
running process gives you a corrupt read at best.

**A restore has never been rehearsed on this deployment.** Doing it once,
deliberately, while nothing is wrong is worth more than any amount of
confidence in the backup job.

### Lost passkey / lockout recovery

The same `DELETE FROM Passkey;` command above is the only recovery path.
There is no recovery flow in the application.

### Deploying a code change

See **`DEPLOY.md`** — the everyday commit → push → deploy loop lives there, along
with the `deploy.sh` script, rollback, and what to do when a deploy fails. The
short version:

```bash
ssh -i ~/.ssh/jenn-french.pem ubuntu@54.80.104.161 './deploy.sh'
```

### Checking on the app

```bash
pm2 list
pm2 logs jenn-french --lines 50
sudo systemctl status nginx
sudo fail2ban-client status sshd
```

### If SSH stops working

Almost always your home IP changed and the security group no longer matches
it. Fix it in the **AWS Console → EC2 → Security Groups → inbound rules →
SSH → Source → My IP**. Never widen it to `0.0.0.0/0` — that is the
documented root cause of both past compromises.

---

## Differences from WEBSITE_TEMPLATE.md

Things that did not match the template, discovered during this deploy.
Worth folding back into it.

1. **Ubuntu 26.04, not 24.04.** Same `apt`, same `ufw`, same
   `systemctl restart ssh`. No commands changed.

2. **Amazon Linux is easy to launch by mistake.** The first instance came up
   as Amazon Linux 2023 — `dnf` instead of `apt`, no `ufw`, user `ec2-user`,
   and certbot is genuinely awkward there. Check the AMI name says *Ubuntu*.
   Because an Elastic IP was already allocated, relaunching cost nothing:
   disassociate, terminate, relaunch, re-associate, and DNS never changed.

3. **apt hangs for minutes on a fresh instance.** The instance has no IPv6
   address but DNS returns AAAA records, so apt tries IPv6 first and stalls.
   Fix, applied before anything else:

   ```bash
   echo 'Acquire::ForceIPv4 "true";' | sudo tee /etc/apt/apt.conf.d/99force-ipv4
   ```

4. **A private repo needs a deploy key.** The template's `git clone` over
   HTTPS assumes a public repo. Generate `ssh-keygen -t ed25519` on the
   server, add the public half to the repo's Deploy Keys with **write access
   unchecked**, and clone over SSH.

5. **Swap is not in the template but should be.** `t3.small` is 2 GB of RAM
   and `npm run build` can exhaust it. 2 GB of swap turns a hard failure
   into a slow one.

6. **Two hardening steps are already done by Ubuntu.**
   `PasswordAuthentication` is already `no` and `unattended-upgrades` is
   already active on a fresh cloud image. Still worth setting
   `PermitRootLogin no` — the default is `prohibit-password`. Use a drop-in
   at `/etc/ssh/sshd_config.d/99-hardening.conf` rather than editing the
   main config, so a package upgrade cannot revert it.

7. **This app has no image uploads.** Skip the `/uploads/` nginx alias and
   the `chmod o+x /home/ubuntu` step entirely — those exist for `sharp`.

8. **`sqlite3` is not installed.** For one-off SQL without installing it,
   `npx prisma db execute --schema prisma/schema.prisma --stdin` works. The
   backup script does need the real `sqlite3` for `VACUUM INTO`.

9. **NodeSource still works.** Their repo is now a single distro-agnostic
   `nodistro` suite, so `setup_22.x` installs fine on a codename this new.
   Ubuntu 26.04's own archive also carries Node 22.22.1, but its separate
   `npm` package is a stale 9.2.0 — NodeSource gives a matching npm 10.

10. **Back up off-box from day one.** The template's advice is to `scp` the
    database before terminating an instance, which fails exactly when it
    matters, because a compromise does not wait for you to remember. Use the
    S3 + IAM-role approach in this document instead.

11. **nginx's default body limit is too small for uploaded pages.**
    `client_max_body_size` defaults to 1 MB; a published page up to our own
    2 MB cap would get a 413 from nginx before Next ever saw the request,
    from both the admin form and `POST /api/pages`. The server block needs:

    ```
    sudo nano /etc/nginx/sites-available/jenn-french
    # inside the `server { ... }` block, add:
    #   client_max_body_size 4m;
    sudo nginx -t && sudo systemctl reload nginx
    ```

    **Applied on the current instance as of 2026-08-04**, and not before —
    this step had been missed since the pages feature shipped, so every
    upload over 1 MB was failing with a 413 nobody could explain. If you are
    chasing that symptom, check this first.

    The file is `jenn-french`, **not** `francaisavecjenn` — the site name and
    the config filename differ, and this document named the wrong one until
    2026-08-04. It holds two `server` blocks: the directive belongs in the
    `listen 443` one that proxies to `localhost:3000`, not in the port-80
    redirect below it. Certbot manages parts of that file, so back it up
    before editing and let `nginx -t` gate the reload.

    That `4m` is the ceiling both upload caps are chosen to fit under —
    `MAX_PAGE_BYTES` (2 MB of HTML, `lib/page-html.ts`) and `MAX_PDF_BYTES`
    (3 MB of PDF, `lib/page-pdf.ts`). Raising either constant means raising
    this by hand on the server first: when it is too low the failure is a raw
    nginx 413 that Next never sees, so the app cannot explain it.
