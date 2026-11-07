# Backup and Restore

Commands assume `.env` exists and Compose services are running. Store backups encrypted outside Docker host.

## Backup

Create backup directory:

```sh
mkdir -p backups
```

Database backup:

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/database.dump
```

Uploads backup:

```sh
docker run --rm -v dashboard-monitoring_app_uploads:/data:ro -v "$(pwd)/backups:/backup" alpine:3.21 tar -czf /backup/uploads.tar.gz -C /data .
```

Volume names use Compose project name. Confirm exact name with `docker volume ls` when directory or project name differs.

## Restore

Restore into maintenance window. Existing database objects may be replaced. Scheduled backups live in timestamped subdirectories; select one complete set and verify checksums before stopping writes:

```sh
BACKUP_SET=$(find backups -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -1)
test -n "$BACKUP_SET" && (cd "$BACKUP_SET" && sha256sum -c SHA256SUMS)
```

Keep `BACKUP_SET` in the same shell for subsequent commands. Never restore directly onto production without a separate verified copy and maintenance approval.

Stop application writes:

```sh
docker compose stop nginx app worker monitor backup
```

Restore database:

```sh
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$BACKUP_SET/database.dump"
```

Restore uploads after confirming volume name:

```sh
docker run --rm -v dashboard-monitoring_app_uploads:/data -v "$(pwd)/$BACKUP_SET:/backup:ro" alpine:3.21 sh -c 'find /data -mindepth 1 -delete && tar -xzf /backup/uploads.tar.gz -C /data'
```

Start application and verify health:

```sh
docker compose start backup app worker monitor nginx
docker compose ps
docker compose logs --tail=100 app
```

## Verification

- Confirm database dump exists and has non-zero size.
- List upload archive contents with `tar -tzf "$BACKUP_SET/uploads.tar.gz"`.
- Perform scheduled restore tests in isolated environment.
- Record backup timestamp, application revision, PostgreSQL version, and restore result.

## Scheduled Restore Test

Run at least quarterly and after PostgreSQL major-version or backup-script changes. Never test by overwriting production.

1. Copy one completed timestamped backup directory to an isolated host or project. Verify `sha256sum -c SHA256SUMS` inside that directory.
2. Start isolated PostgreSQL using same major version as production and create empty target database.
3. Restore `database.dump` with `pg_restore --clean --if-exists --no-owner`; restore `uploads.tar.gz` into empty isolated upload volume.
4. Start application against isolated database and uploads. Confirm `/api/health`, production-like OAuth login, representative dashboard totals, one evidence download, and ClamAV availability.
5. Record backup timestamp, source revision, PostgreSQL version, restore duration, checks performed, tester, result, and remediation ticket for every failure.
6. Destroy isolated test data after evidence and findings are retained according to policy.

Successful test proves both database and upload archive are readable together. File existence alone does not prove restorability.


## Local Restore Drill Record

6 November 2026: restored timestamped daily `database.dump` into isolated `restore_verify` database using PostgreSQL 17.11. Counts matched 65 projects and 2 users; `pg_restore` succeeded. Temporary database removed. Upload archive and SHA256 checksums verified; full isolated app/OAuth/evidence-download drill still pending production credentials.

6 November 2026, second drill: restored database and uploads into isolated resources, ran latest migrations, started isolated Next.js container, signed in through local test auth, queried dashboard (65 projects), downloaded archived evidence (52,386 bytes), verified file SHA-256 against database checksum. Isolated container, database, and upload volume removed after success. Production Google OAuth remains untested pending credentials.
