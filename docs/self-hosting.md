# EXIM Super App: self-hosting

This deployment is intentionally isolated from EXIM Hub and EximDaily. It uses its own Compose project, PostgreSQL database, document and backup volumes. The web container may join the shared reverse-proxy network, but the database never does and no service publishes a host port.

## Required server environment

Create a server-only environment file outside Git and restrict it to the deployment operator (`chmod 600`). At minimum it must define:

```dotenv
POSTGRES_DB=exim_superapp
POSTGRES_USER=exim_superapp_owner
POSTGRES_PASSWORD=<strong random value>
APP_DB_PASSWORD=<different strong random value>
MIGRATION_DATABASE_URL=postgresql://exim_superapp_owner:<URL-encoded owner password>@db:5432/exim_superapp
BACKUP_DATABASE_URL=postgresql://exim_superapp_owner:<URL-encoded owner password>@db:5432/exim_superapp
DATABASE_URL=postgresql://exim_superapp_app:<URL-encoded app password>@db:5432/exim_superapp
SESSION_SECRET=<at least 32 random bytes>
APP_BASE_URL=https://<dedicated-super-app-hostname>
CADDY_NETWORK=<existing Caddy network name>
CADDY_NETWORK_EXTERNAL=true
```

Do not reuse the Hub or EximDaily database, passwords, volumes, cookies or session secret. `web` uses the restricted `exim_superapp_app` role; the owner URL is reserved for migrations and backups. PostgreSQL is reachable only on the private Compose network. Caddy must proxy the dedicated hostname to `web:3000` (or a unique network alias supplied by the deployment layer); it must not proxy the database.

## First deployment

Run from the checked-out exact application commit:

```sh
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml build web
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml --profile ops run --rm migrate
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml up -d db web db-backup
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml ps
```

The migration runner records every filename and SHA-256 in `schema_migrations`. It stops if an already-applied migration was edited. Never edit an applied migration; add the next numbered file.

Before sending traffic, verify the container health, `/api/health`, a real login, role permissions and cross-workspace/client-company denial. The committed Compose file does not modify Caddy or any other EXIM service.

### Access-context migration 0002

`0002_explicit_access_context.sql` adds an exact `active_membership_id` to each session. Its composite foreign key guarantees that a session cannot point at another user's membership. Existing sessions keep a null context and are sent to `/select-context`; a new login selects automatically only when exactly one active membership exists.

Routine application rollback does not drop this column or constraint: the previous image can ignore additive schema. If the migration itself must be reversed, stop `web`, create and verify a fresh dump, restore the pre-migration backup into a separate database first, and only then make a human-approved restore decision. Never edit `0002` after it has been recorded in `schema_migrations`.

## Backups and export

`db-backup` creates a PostgreSQL custom-format dump on startup and then every 24 hours by default. Dumps and SHA-256 files live in the dedicated `postgres_backups` volume. The default retention is 14 days. Create an on-demand backup with:

```sh
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml --profile ops run --rm backup-once
```

List the dedicated volume without printing database content:

```sh
docker run --rm -v exim-superapp_postgres_backups:/backups:ro alpine:3.21 \
  /bin/sh -c 'for f in /backups/exim-superapp-*.dump; do [ -f "$f" ] && basename "$f"; done'
```

To download a dump, copy it to an operator-owned host directory and then use `scp`. Mount only the backup volume and the exact destination; never expose the database port:

```sh
mkdir -p /srv/exim-superapp/export
docker run --rm \
  -e BACKUP_FILE=exim-superapp-YYYYMMDDTHHMMSSZ.dump \
  -v exim-superapp_postgres_backups:/backups:ro \
  -v /srv/exim-superapp/export:/export \
  -v "$PWD/scripts/server:/scripts:ro" \
  alpine:3.21 /bin/sh /scripts/export-backup.sh
```

The resulting `.dump` is portable to any compatible PostgreSQL installation and is accompanied by its checksum. Document files are a separate volume; back up `exim-superapp_documents_data` independently with server-level encrypted backup tooling.

## Restore drill

Restore is destructive and must first be tested against a separate empty database. Stop the web service to prevent writes, take a fresh backup, then pass a dedicated restore URL and explicit confirmation:

```sh
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml stop web
RESTORE_DATABASE_URL='postgresql://...@db:5432/exim_superapp_restore_test' \
RESTORE_CONFIRM=YES_REPLACE_EXIM_SUPERAPP \
BACKUP_FILE=exim-superapp-YYYYMMDDTHHMMSSZ.dump \
docker compose --env-file /secure/path/exim-superapp.env -f docker-compose.server.yml --profile ops run --rm restore
```

The restore script accepts only an `exim-superapp-*.dump` inside the backup volume, requires a valid SHA-256 sidecar and refuses to run without the exact confirmation string. After restore, rerun migrations and the tenant-isolation smoke tests before restarting `web`.

## Rollback

Application rollback means deploying the previous known-good image/commit. Database migrations are forward-only. If a database rollback is unavoidable, stop `web`, preserve a fresh pre-rollback dump, restore the last known-good dump, deploy the matching application commit and rerun verification. Removing the Super App stack does not remove named volumes unless an operator explicitly asks Compose to do so; never use `down -v` during a routine rollback.
