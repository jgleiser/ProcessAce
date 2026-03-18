# TLS Setup

ProcessAce should be deployed behind TLS in production. The recommended in-repo path is the Caddy overlay in `docker-compose.tls.yml`, which terminates HTTPS in front of the existing `app` service.

## Recommended deployment

1. Copy `.env.example` to `.env`.
2. Set the standard production secrets:
   - `JWT_SECRET`
   - `ENCRYPTION_KEY`
   - `SQLITE_ENCRYPTION_KEY`
   - `REDIS_PASSWORD`
   - `CORS_ALLOWED_ORIGINS`
3. Set the TLS overlay variables:
   - `CADDY_HOST`: public hostname, for example `processace.example.com`
   - `CADDY_EMAIL`: ACME contact email
4. Start the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
```

If the image was built before the SQLCipher dependency changed, force a clean rebuild:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml build --no-cache app
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
```

When the overlay is active:

- Caddy publishes `80` and `443`
- `app` is reachable only on the internal Compose network
- Redis remains internal-only and still requires `REDIS_PASSWORD`

Docker operators do not need to install SQLCipher separately on the host. The container image compiles the production encrypted SQLite module during the build.

## Caddy behavior

The shipped Caddyfile:

- provisions certificates automatically
- redirects traffic to HTTPS by default
- reverse proxies requests to `app:3000`

## Existing production database migration

Production now expects encrypted SQLite in SQLCipher-compatible mode. Existing plaintext production SQLite files are not auto-migrated.

Use this migration pattern before enabling the new runtime:

1. Stop the application and back up the existing plaintext database file.
2. Open the plaintext database with a SQLite shell.
3. Open a SQLCipher-capable shell with the target `SQLITE_ENCRYPTION_KEY`.
4. Export/import the schema and data into the encrypted database.
5. Replace the old plaintext file with the encrypted `processAce.db`.
6. Start ProcessAce with `SQLITE_ENCRYPTION_KEY` set.

If ProcessAce detects a plaintext production database, startup fails intentionally so the migration can be completed safely.

## Non-Docker production installs

If you deploy without Docker, install the normal native Node.js build prerequisites for `better-sqlite3` modules on the target machine before running `npm ci` or `npm rebuild` when your platform does not have a prebuilt binary available.

## Alternatives

If you already standardize on another reverse proxy, nginx and Traefik are acceptable alternatives. Keep the same deployment rules:

- terminate TLS before traffic reaches the app container
- expose only the reverse proxy publicly
- keep Redis off the public network
- set `CORS_ALLOWED_ORIGINS` to the HTTPS origin served by the proxy
