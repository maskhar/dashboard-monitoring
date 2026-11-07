# Deployment

## Requirements

- Docker Engine 24+ with Docker Compose v2
- Production DNS and TLS reverse proxy for internet-facing deployments

## Configure

1. Create local environment file:

   ```sh
   test ! -f .env && cp .env.example .env
   ```

2. Replace `POSTGRES_PASSWORD` and `AUTH_SECRET`. Generate strong values outside source control:

   ```sh
   openssl rand -base64 32
   ```

3. Set `NEXTAUTH_URL` to public HTTPS URL for production.

4. Complete Google OAuth credential handoff:

   - Platform owner creates production OAuth client in organization-controlled Google Cloud project.
   - Set authorized origin to public HTTPS origin and callback to `<NEXTAUTH_URL>/api/auth/callback/google`.
   - Secret owner transfers client ID and client secret through approved secret manager, never chat, ticket, or Git.
   - Deployer sets `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_MODE=production`, and `AUTH_DEMO_ENABLED=false` in production environment.
   - Application owner signs in with allowed Workspace account and records date, tester, OAuth client owner, and result. Rotate credential after suspected disclosure or ownership change.

Never commit `.env`. Compose fails early when required secrets are absent.

## Deploy

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

Application entrypoint and host port depend on Compose/reverse-proxy wiring. Containers connect internally through service DNS names.

Check health and logs:

```sh
docker compose ps
docker compose logs --tail=200 app db
```

## Monitoring and Alerting

`scripts/monitor.ts` checks app health, a direct PostgreSQL query, failed/stale notification jobs, ClamAV `PING`, and completed backup age. It uses normal service protocols and never accesses Docker socket.

Compose already includes `monitor` service:

- Builder image runs `npm run monitor` inside private `backend` network.
- Set `DATABASE_URL`, `APP_HEALTH_URL=http://app:3000/api/health`, `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310`, and optional `MONITOR_WEBHOOK_URL`.
- Mount same host backup directory as backup service at `/backups:ro`; set `BACKUP_DIR=/backups`.
- Set `BACKUP_MAX_AGE_SECONDS` above backup interval plus expected runtime, recommended `90000` for daily backups.
- Optional tuning: `MONITOR_POLL_MS=60000`, `MONITOR_TIMEOUT_MS=10000`, `MONITOR_HEARTBEAT_MS=3600000`, `MONITOR_SERVICE_NAME=utero-dashboard`, `NOTIFICATION_MAX_STALE_SECONDS=900`.

Webhook receives JSON with `service`, `status`, `message`, `timestamp`, and per-check results. Alerts publish on first failure and hourly while unhealthy; recovery publishes once. Healthy heartbeat publishes hourly. Provider must accept generic JSON or use an HTTP relay that maps payload to Slack, Teams, PagerDuty, or another incident tool.

## Update

Back up database and uploads first. Then rebuild and replace application container:

```sh
docker compose build --pull app
docker compose up -d --no-deps app
docker compose ps
```

If health check fails, inspect logs and redeploy previous image or source revision. Compose keeps PostgreSQL and uploads in named volumes during container replacement.

## Stop

```sh
docker compose down
```

Do not add `--volumes` unless permanent database and upload deletion is intended.

## Production Notes

- Cloudflare Tunnel reaches only Nginx on `carubra-network`. App, DB, scanner, worker, and monitor stay private.
- Base Compose publishes neither app nor DB ports. Development override binds both to `127.0.0.1` only.
- Monitor container health, restart count, disk space, and backup job results.
- Test restore procedure regularly on separate host or isolated Compose project.



## Development and release gates

Production deploy requires Google OAuth credentials, HTTPS `NEXTAUTH_URL`, scanner, and `AUTH_SECRET` of at least 32 characters. Without them the app refuses to start. Do not use `compose.dev.yaml` for public production.

Local UAT (tunnel returns maintenance HTTP 503; app and DB available only via localhost):

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Production when credentials are provisioned:

```sh
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build
```

Set `APP_VERSION` and `BUILD_REVISION` (Git commit SHA after first commit) for every release. App image tag and labels record both; `/api/health` exposes them. Check `docker compose ps` and restore a backup in an isolated database before public launch. Keep backups encrypted off-host; local backup folder alone cannot survive a host failure. Set provider webhook URLs and monitoring webhook before calling notifications and paging production-ready.

Before switching from local UAT to production, Admin must add ACTIVE users whose emails match verified Google accounts. Demo `@utero.local` users cannot sign in through Google. Existing `.env` contains development secrets and URLs: review every value before changing Compose mode. Never paste OAuth secrets into chat.

Windows release build after first commit: `pwsh -File scripts/release.ps1`. Script requires clean Git worktree and local Google credentials, builds tagged images, then stops before deployment for backup review.

## Edge and notification safeguards

- Nginx rejects unknown hostnames and does not expose the DB-backed health endpoint over the tunnel. Containers use it internally for readiness.
- Rate limits use the tunnel peer IP, not untrusted client headers. This limits aggregate traffic per tunnel; configure trusted edge real-IP or dedicated network for per-client limits. Public HTTPS termination belongs to Cloudflare; verify the HSTS header reaches browsers.
- Set NOTIFICATION_WEBHOOK_TOKEN before enabling email or WhatsApp webhooks. Configure receivers to reject timestamps outside a short replay window, verify `x-utero-signature` as HMAC-SHA256 over `<x-utero-timestamp>.<x-utero-event-id>.<raw-body>`, and deduplicate by `x-utero-event-id`.
- Monitor fails on permanently failed notification jobs or jobs stale for longer than NOTIFICATION_MAX_STALE_SECONDS; investigate and requeue failures only after addressing the provider issue.
