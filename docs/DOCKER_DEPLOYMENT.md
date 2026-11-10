# Docker deployment for the API and worker

This Compose setup packages the API and its separate background worker into the same multi-stage Node.js image. Supabase remains the external PostgreSQL and Auth provider. Redis runs as a private container and is not published to the host.

## Prerequisites

- Docker Engine with the Docker Compose plugin.
- A Supabase project and a PostgreSQL connection string suitable for the API/worker.
- The server-side Supabase configuration required by the API.
- A host reverse proxy (for example, Caddy or Nginx) for public HTTPS traffic.

## Configure on the host

From the repository root, create the two private environment files:

PowerShell:

```powershell
Copy-Item docker.env.example .env
Copy-Item apps/api/.env.example apps/api/.env
```

Edit the root `.env`:
- Set `REDIS_PASSWORD` to a 64-character hexadecimal password. Generate one on a Linux host with `openssl rand -hex 32`.
- Set `API_PORT` if port 4000 is already occupied.
- Set `TRUST_PROXY_HOPS=1` only when the API is reachable exclusively through one trusted reverse proxy. Keep it at 0 for direct/local access.

Edit `apps/api/.env`:
- Set `DATABASE_URL` to the Supabase PostgreSQL connection string. Use the provider's recommended pooled connection option for application traffic and verify TLS requirements.
- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for server-side bearer-token verification.
- Set `SUPABASE_SERVICE_ROLE_KEY` only in this private server-side file if server-side account administration is required. Never place it in mobile/web public variables.
- Keep `NATIVE_POSTGRES_READS=false` until the existing staged database-read verification is completed.
- Leave `EMAIL_DELIVERY_ENABLED=false`. Add `RESEND_API_KEY` and `WELCOME_EMAIL_FROM` only when Resend is configured and email delivery is intentionally enabled.

Both files are ignored by Git. Do not commit real credentials or paste them into logs.

## Build and start

```powershell
docker compose build
docker compose up -d
docker compose ps
```

Check the API health endpoint locally:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
```

View service logs:

```powershell
docker compose logs --tail 100 api
docker compose logs --tail 100 worker
docker compose logs --tail 100 redis
```

Stop the services without deleting Redis data:

```powershell
docker compose down
```

The named Redis volume persists across container recreation. Do not use `docker compose down -v` unless you intentionally want to delete that data.

## Network and security design

- The API binds to host loopback only; terminate public TLS at the host reverse proxy.
- Redis has no published host port and is attached only to an internal Docker network shared with the API.
- The worker is a separate supervised container and does not expose an HTTP port.
- Both Node processes run as the unprivileged `node` user.
- The API image contains compiled application code and production dependencies only; build tooling and TypeScript dev dependencies are pruned from the runtime image.
- API and worker receive private configuration at runtime. Environment files are not copied into the image.
- Use a firewall to expose only SSH and the HTTPS reverse-proxy ports. Do not expose PostgreSQL or Redis publicly.

## Important operational limits

This Compose configuration is a deployment package, not a production deployment. It does not create or migrate the Supabase database, configure DNS/TLS, deploy the Edge Functions, or start services on the user's VPS. The worker remains inactive until these containers are deliberately started on a host with valid private environment variables.

Email sending remains off by default. Do not enable the queue-based welcome-email path until the worker is running and Resend is configured. The notification inbox continues to use the existing database/realtime flow; report exports have not yet been defined as a background job.
