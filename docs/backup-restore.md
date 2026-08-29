# Backup and restore

A backup nobody has restored is a hope. Everything in this runbook has been run
end to end against the local Docker Postgres, and the transcripts below are the
real output, not an illustration of what the output would look like.

- **What is backed up:** the whole Postgres database, and the blob store that
  holds every survey photo, sketch, site capture and rendered export.
- **How often:** daily, plus before any migration or restore drill.
- **Kept for:** 14 days of dailies by default (`BACKUP_RETENTION_DAYS`).
- **Restore is verified by:** `scripts/verify-restore.sh`, which restores into a
  scratch database and compares row counts table by table. Run it monthly and
  after any change to the schema tooling.

## 1. What is in scope, and what is not

| Thing | Where it lives | Backed up by | Notes |
|---|---|---|---|
| Application data | Postgres | `scripts/backup-db.sh` | Full logical dump, custom format |
| Photos, sketches, captures, exports | `.data/blobs` (local driver) or a bucket | `scripts/backup-blobs.sh` | Content-addressed, append-only |
| Schema history | `prisma/migrations/` | git | 13 migrations as of 2026-08-27 |
| Secrets (`AUTH_SECRET`, DB URL, webhook URL) | host env / secret manager | **not backed up here** | See "Secrets" below |
| Build output, `node_modules` | `.next/`, `node_modules/` | not backed up | Rebuilt from source |

**A database restored without its blobs is a project full of broken
references.** The database stores only a storage key (`ab/cd/<sha256>.jpg`); the
bytes are on disk or in a bucket. Restore one without the other and the app
comes back looking intact while every image 404s. The two archives are a pair.

**Order matters, and it is database first.** The blob store is append-only, so:

- Dump the database, *then* archive the blobs. A blob uploaded in between ends
  up in the archive with nothing pointing at it: an orphan file, which is
  harmless.
- Archive the blobs first and a blob uploaded in between ends up referenced by
  the database dump with no file behind it: a broken reference, which is not.

`scripts/backup-all.sh` runs them in that order.

### Secrets

`AUTH_SECRET`, `DATABASE_URL`, `VOICE_TICKET_SECRET` and
`MONITORING_ALERT_WEBHOOK_URL` are deliberately not in any archive here. Putting
them in a dump means every copy of that dump is a copy of the credentials. They
live in the host's environment settings or secret manager, are listed in
`.env.example`, and are documented in `docs/deploy.md` §3. Losing them costs one
`openssl rand -base64 32` and one round of re-entering values; it does not cost
data. Losing `AUTH_SECRET` invalidates every open session, nothing more.

## 2. Taking a backup

```sh
pnpm db:backup          # database only
pnpm blobs:backup       # blob store only
pnpm backup             # both, in the right order
```

Real run:

```
$ ./scripts/backup-db.sh
note: local pg_dump is 14, server is 16; using postgres:16-alpine instead.
Dumping to /Users/b/Desktop/code/Pool-forge/.backups/poolforge-20260828T014127Z.dump
Wrote /Users/b/Desktop/code/Pool-forge/.backups/poolforge-20260828T014127Z.dump (309047 bytes)
```

Output lands in `.backups/` (gitignored) unless `BACKUP_DIR` says otherwise. Each
archive gets a `.sha256` beside it, written at backup time: without it there is
no way to tell a corrupted archive from a corrupted restore months later.

### The version trap, and why the scripts use Docker

This bit is the reason `scripts/lib/pgtools.sh` exists. Homebrew on this machine
has `pg_dump` 14 while docker-compose runs `postgres:16`, and pg_dump refuses to
dump a newer server:

```
pg_dump: error: server version: 16.13; pg_dump version: 14.17
pg_dump: error: aborting because of server version mismatch
```

`psql` connects across that gap happily, so the mismatch is invisible until the
day you need a backup. The scripts therefore check the server major against the
client major up front, and fall back to running the same commands inside a
throwaway `postgres:16-alpine` container, which is by construction the right
version because it is the image compose already runs. Set `PG_IMAGE` if the
server is ever upgraded.

Two smaller traps found while making this work, both encoded in the scripts:

- `pg_dump --file=/dev/stdout` fails inside a container with `could not fsync
  file "/dev/stdout": Invalid argument`. Omit `--file`; pg_dump writes the
  archive to stdout by default.
- `localhost` in `DATABASE_URL` means the container itself once the tools run
  inside one. The scripts rewrite it to `host.docker.internal`.

## 3. Restoring

```sh
./scripts/restore-db.sh <dump-file> [target-database]
```

With no target it restores into `poolforge_restore_<timestamp>`. That default is
deliberate: the usual reason to run a restore is to check the backup, and that
must never be one typo away from flattening the live database. Restoring over an
existing database needs `FORCE=1`.

Blobs:

```sh
tar -xzf .backups/poolforge-blobs-<stamp>.tar.gz -C <parent-of-blob-dir>
```

The store is content-addressed, so extracting over an existing store is safe and
idempotent: identical bytes produce identical filenames.

### Full disaster recovery, in order

1. Bring up an empty Postgres and point `DATABASE_URL` at it.
2. `FORCE=1 ./scripts/restore-db.sh <dump> poolforge`
3. Extract the blob archive over `BLOB_STORE_LOCAL_DIR` (or restore the bucket).
4. `npx prisma migrate status` — should report the schema up to date. The dump
   carries `_prisma_migrations`, so a restored database knows its own history.
5. Restore the secrets from the host's secret store (see §1).
6. Smoke test per `docs/deploy.md` §5: sign in, open a project, open a proposal,
   and **open a project that has photographs**, which is the check that catches
   a database restored without its blobs.

## 4. Proving the restore

`scripts/verify-restore.sh` takes a fresh dump, restores it into a scratch
database, counts every row of every table in the public schema on both sides,
compares them, and drops the scratch database. The table list is derived from
`pg_class` rather than hardcoded, so a table added next month is checked without
anybody remembering to update this file.

Real run, 2026-08-28, against the local Docker Postgres:

```
$ ./scripts/verify-restore.sh
note: local pg_dump is 14, server is 16; using postgres:16-alpine instead.
== 1. Taking a fresh dump ==

== 2. Restoring into scratch database 'poolforge_verify_20260828014136' ==
note: local pg_restore is 14, server is 16; using postgres:16-alpine instead.

== 3. Comparing row counts, source against restored ==
table                                  source   restored  result
AppSetting                                  0          0  ok
CommandAuditLog                          2908       2908  ok
Customer                                   23         23  ok
Drawing                                   124        124  ok
DrawingObject                               0          0  ok
Export                                     25         25  ok
ImageAnalysis                              23         23  ok
ImportSession                              15         15  ok
IntakeLink                                  5          5  ok
IntakeRateCounter                         318        318  ok
IntakeSubmission                            1          1  ok
Material                                   12         12  ok
Organization                               89         89  ok
OrganizationMember                          2          2  ok
PriceBook                                 182        182  ok
PriceBookItem                             368        368  ok
PriceChange                                 0          0  ok
PriceChangeRequest                          0          0  ok
PricingRule                                 0          0  ok
Project                                   129        129  ok
ProjectLineItem                             2          2  ok
Quote                                      87         87  ok
QuoteLineItem                             386        386  ok
RateLimitCounter                          875        875  ok
SceneTemplate                               0          0  ok
ShapeTemplate                               3          3  ok
SiteCapture                                 0          0  ok
SourceImage                                 7          7  ok
StencilDef                                 75         75  ok
User                                        2          2  ok
ValidationResult                          123        123  ok
VoiceSession                                5          5  ok
_prisma_migrations                         13         13  ok

Restore verified: every table matched, 5802 rows in total.
```

Row counts prove nothing arrived empty. They do not prove the *contents* came
back, so the drill also reads real rows out of the restored copy:

```
$ ./scripts/restore-db.sh .backups/poolforge-20260828T014127Z.dump poolforge_restore_demo
poolforge-20260828T014127Z.dump: OK
Creating 'poolforge_restore_demo'
Restoring .backups/poolforge-20260828T014127Z.dump into 'poolforge_restore_demo'
Restored into 'poolforge_restore_demo'

$ psql "$RESTORED_URL" -c 'SELECT count(*) AS projects, count(DISTINCT "orgId") AS orgs,
                                  max("createdAt")::date AS newest FROM "Project";'
 projects | orgs |   newest
----------+------+------------
      129 |    2 | 2026-08-28

$ psql "$RESTORED_URL" -c 'SELECT p."jobNumber", left(p."name", 18) AS name, q.total
                           FROM "Project" p JOIN "Quote" q ON q."projectId" = p.id
                           ORDER BY q.total DESC NULLS LAST LIMIT 3;'
 jobNumber |        name        |    total
-----------+--------------------+--------------
      1108 | Bounds ttsg        | 155928492.06
      1019 | Mrs Alvarez's Pool | 144116399.02
      1104 | Stress l902        |    811329.30
```

That is the part that matters: joined rows, with money on them, read back out of
a database that did not exist five minutes earlier. (The names above are seed
and stress-test fixtures, not customers.)

### The blobs, restored as well

Row counts say nothing about the photographs. The blob half of the drill
restores the archive into a scratch directory, re-hashes every file, and checks
that the key the database actually references is among them. Because the store
is content-addressed, "this file hashes to its own filename" is a complete
integrity check, not a sample:

```
$ ARCHIVE=.backups/poolforge-blobs-20260828T014358Z.tar.gz
$ SCRATCH=$(mktemp -d)
$ (cd .backups && shasum -a 256 -c "$(basename $ARCHIVE).sha256")
poolforge-blobs-20260828T014358Z.tar.gz: OK
$ tar -xzf "$ARCHIVE" -C "$SCRATCH"

original blobs: 49
restored blobs: 49

== every restored file's sha256 must equal the filename it is stored under ==
all 49 restored blobs hash to their own storage key: content intact

== a blob the database actually references ==
SourceImage.storageKey = 4e/c4/4ec4f157e9d9652fc6914b89d5b4d77a5e3cedf20ea91a35f66cae026f1f9f89.jpg
-rw-r--r--  1 b  staff  2269526  .../blobs/4e/c4/4ec4f157e9d9652fc6914b89d5b4d77a5e3cedf20ea91a35f66cae026f1f9f89.jpg
```

That last step is the one that catches the failure mode this section exists for:
a database restored beside a blob store that does not contain what it points at.

### Is the verifier itself worth anything?

A checker that prints "ok" whatever happened is worse than no checker. So the
verifier was checked the same way the code is: by breaking what it guards. A
`DELETE FROM "Quote"` was inserted into the restored copy between the restore
step and the comparison step, and the run was repeated:

```
Quote                                      87          0  MISMATCH
...
RESTORE VERIFICATION FAILED: at least one table did not come back.
exit status: 1
```

With the sabotage removed it goes back to `Restore verified: every table
matched`. The comparison is real and the exit status is real, so it can be put
in a cron job and trusted to shout.

What this drill has *not* yet proved, stated plainly rather than glossed over:

- It has only been run against local Docker Postgres. The managed-Postgres path
  (§6) is written from the provider's documented behaviour and needs its own
  drill once a production database exists.
- The restored pair has not been booted and clicked through in a browser. The
  referenced blob is present and intact on disk; nobody has watched it render.
- Nobody has timed a full recovery, so the RTO below is an estimate.

## 5. Schedule and retention

| | Frequency | Retention | RPO | RTO |
|---|---|---|---|---|
| Database dump | daily 03:00 UTC | 14 days | up to 24 h | ~15 min (estimate) |
| Blob archive | daily 03:05 UTC | 14 days | up to 24 h | ~15 min (estimate) |
| Restore drill | monthly | n/a | n/a | n/a |

Daily-only means up to a day of work can be lost, which is the honest trade for
a single-instance beta. It is also the number to fix first if that stops being
acceptable: managed Postgres point-in-time recovery (§6) takes the RPO to
minutes without any of this changing.

Cron on a single host:

```cron
0 3 * * * cd /srv/pool-forge && BACKUP_DIR=/var/backups/pool-forge ./scripts/backup-all.sh >> /var/log/pool-forge-backup.log 2>&1
```

Two things that make a scheduled backup real rather than decorative:

- **Copy it off the machine.** A backup on the same disk as the database
  survives a bad migration and nothing else. `rclone`, `aws s3 sync` or
  `gsutil rsync` the backup directory to somewhere else, daily, after the dump.
- **Alert when it does not run.** A silent backup job is indistinguishable from
  a working one. Point the cron line at a dead-man's-switch (healthchecks.io or
  equivalent), or have it POST to the same
  `MONITORING_ALERT_WEBHOOK_URL` the app uses on failure.

## 6. Production: managed Postgres and a bucket

`docs/deploy.md` targets Neon. Managed Postgres changes what "backup" means and
these scripts remain useful as the second copy rather than the only one.

- **Neon** keeps a continuous history and supports point-in-time restore and
  branching. Set the history window to at least 7 days, and prefer restoring
  into a *branch* first so the live endpoint is untouched while you check the
  data. That gives an RPO of minutes rather than a day.
- **Still take the logical dumps.** Provider-side history protects against your
  mistakes; it does not protect against losing access to the provider account,
  and it cannot be restored anywhere else. A `pg_dump` archive can be restored
  into any Postgres 16.
- **Blobs in GCS:** turn on object versioning and a lifecycle rule, and give the
  runtime service account write access only to its own prefix. A content-
  addressed store never overwrites, so versioning is cheap insurance against a
  delete rather than against a rewrite.
- **Never `prisma db push` at a populated production database.** Use
  `prisma migrate deploy`, and take a dump immediately before either.

## 7. When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `aborting because of server version mismatch` | local client older than server | the scripts already fall back to Docker; if Docker is absent, `brew install postgresql@16` |
| `could not fsync file "/dev/stdout"` | `--file=/dev/stdout` inside a container | already fixed; do not add `--file` back |
| Restore stops on `role "pool" does not exist` | dump made without `--no-owner` | re-dump with `scripts/backup-db.sh`, which passes it |
| Restore succeeds, every image is broken | database restored without its blobs | extract the blob archive; see §1 |
| `database "…" already exists` | restoring over an existing target | `FORCE=1`, deliberately not the default |
| Checksum mismatch on restore | archive corrupted in transit or at rest | use the previous day's archive; this is why the checksum is written at backup time |
